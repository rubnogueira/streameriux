# Video memory: investigation and a hardware-accelerated path

This documents the memory investigation behind the frame pipeline and studies a
proper hardware-accelerated video path, since the current "decode → bitmap →
`<img>`" approach is memory-hungry by construction.

## What was measured

All numbers are RSS from `process.memoryUsage()`, most with **forced GC each
sample** (`Bun.gc(true)`) so a true leak keeps climbing while GC lag flattens.

| Scenario | Frames | Result |
|---|---|---|
| JS pipeline only, headless (VOD) | 4,760 over ~4 min | **Flat** ~350 MB (heap/ext plateau) |
| JS pipeline only, headless (live) | 2,666 over ~2 min | **Flat** ~150 MB |
| GPUI window, unique data-URL frames, max speed | 15,000 | Rate-driven spike to ~1.4 GB, **recovers**; no monotonic climb |
| GPUI window, burst-then-idle cycle | 6,474 then idle | Returns to **~114 MB** (near baseline) |
| Real app, focused, live stream, ~4 min | thousands | Sawtooth 60–600 MB, **recovers**; no monotonic climb |
| 1280 px vs 640 px unique frames | matched | 1280 → 1–2.5 GB; **640 → flat ~250 MB** |

### Ruled out (bounded in testing)

- **The JS decode/encode pipeline** — mediabunny decode, our BMP+base64, the
  retained double-buffer. Flat over thousands of frames, VOD and live.
- **GPUI image rendering itself** — 15,000 unique images produced no monotonic
  growth; memory tracks the *rate* of production and is reclaimed on idle.
- **The live path** — `scheduleLiveRefresh`, continuous segment ingestion, the
  growing DVR window: flat headless.
- **EPG store** — each sync/hydrate calls `load()` which resets the store before
  re-merging, so `programmesByChannelId` does not accumulate across syncs.
- **Now Playing artwork** — the native bridge only reloads the image when the
  artwork URL changes (guarded).

### Root cause of the *large, fast* growth (already mitigated)

GPUIX has no video surface, so each frame is a full-resolution bitmap the
renderer decodes and uploads to a GPU texture, reclaimed only in periodic
passes. When blitted byte-rate (resolution × fps) outruns that reclaim rate,
bitmaps pile up between passes; on a never-idle stream this reaches gigabytes in
seconds at 1280 px. Mitigated in `src/frame.ts` (downscale to 640 px, tunable
via `STREAMER_MAX_FRAME_WIDTH`) and `src/player.ts` (pace blits to ~33 fps,
dropping decode-burst frames). Measured flat at 640 px.

### The slow residual (not reproduced here)

A continued *slow* climb to ~10 GB over a long real session was **not
reproducible** in minutes-long tests on this hardware/streams. Its size is
consistent with a small per-frame native residual (a few percent of each frame
not fully reclaimed — GPU atlas fragmentation, or a driver-side texture the
renderer frees lazily), which needs hundreds of thousands of frames (hours of
playback) to accumulate. It could also require conditions this environment
can't hold continuously (a real focused window for hours, the packaged `.app`,
channel switching, a specific codec/driver). See "Pinpointing" below.

### Hardening applied for plausible long-run vectors

- **Audio graph** (`src/player.ts`): finished `AudioBufferSourceNode`s are now
  `disconnect()`-ed on `ended`, not just dropped from our Set — so a played
  buffer can never linger wired into the gain node if the audio loop stalls
  (e.g. no output device).
- **Now Playing** (`src/media-session.ts`): updates are deduped to whole-second
  position + change-driven metadata, cutting native calls from ~10/s to ~1/s.

## Study: a hardware-accelerated video path

The `<img>` approach fights the renderer on every frame. The proper fix is to
never hand video frames to GPUI at all, and instead let the OS composite a
hardware-decoded video layer positioned over the GPUIX window.

### Option A — native video layer composited over the window (recommended)

Render video into a dedicated native surface that the OS window server
composites *on top of* the GPUIX window's video region:

- **macOS:** `AVSampleBufferDisplayLayer` (or a `CAMetalLayer`) fed
  `CMSampleBuffer`s. Decoded `CVPixelBuffer`s (ideally from **VideoToolbox**
  hardware decode) are enqueued directly; the compositor scales and draws them
  on the GPU with zero per-frame CPU copies and no application-side image cache.
- **Windows:** a DirectComposition/`IDCompositionVisual` swapchain, or a layered
  child HWND with a D3D11 swapchain.
- **Linux:** a subsurface (Wayland `wl_subsurface`) or an X11 child window with a
  GL/VA-API surface.

The GPUIX window draws everything *except* the video rectangle (leave it
transparent or a punch-through region); the native layer shows through. Controls
still render in GPUIX on top by keeping the video layer below the chrome, or by
drawing chrome in a second overlay layer.

- **Pros:** hardware decode + hardware compositing, effectively **zero** steady
  per-frame heap/texture churn, best quality and battery, full resolution.
- **Cons:** needs a small native addon per platform (NAPI-RS/Swift/ObjC++), and
  careful geometry sync (position/size/occlusion/fullscreen) with the GPUIX
  window. Rounded corners / overlap with GPUIX chrome need layer ordering.
- **Effort:** medium–high; macOS alone is a strong first target and matches the
  app's current platform focus.

### Option B — hardware decode now, same blit path

Mediabunny decodes via **WebCodecs** where available, which can use the
platform hardware decoder (VideoToolbox on macOS). That offloads *decode* from
the CPU but does **not** fix memory — the bottleneck here is the blit/upload and
the renderer's image lifecycle, not decode. Worth confirming hardware decode is
actually engaged (fewer CPU-bound stalls), but it is not the memory fix.

### Option C — an updatable GPU texture in GPUIX (upstream)

The cleanest fit for this codebase would be a GPUIX element backed by a **single
GPU texture updated in place** each frame (glTexSubImage-style), or a
`RenderImage` handle whose pixels can be rewritten without allocating a new
image/atlas entry. That keeps exactly one texture resident regardless of frame
count — no cache, no accumulation — while staying inside the GPUIX scene graph
(so chrome, layout, and hit-testing keep working normally). This requires a
GPUIX API addition (an "external texture" / "video" element, or a mutable-image
source) and is the ideal long-term answer; it is the same "GPU video surface"
listed as the top TODO in the README.

### Recommendation

Ship the current mitigations (done). For the real fix, pursue **Option A on
macOS** (AVSampleBufferDisplayLayer + VideoToolbox) as a native addon, or drive
**Option C** upstream in GPUIX if a texture-update API can be added — whichever
is cheaper to land. Both eliminate the per-frame image lifecycle that this
document's residual almost certainly lives in.

## Option A — implemented (macOS, default on)

Option A is implemented as an in-process Swift dylib. It is **on by default on
macOS** and toggled in **Settings → General → "Hardware video surface"** (stored
as `native_video` in `settings.toml`; `STREAMER_NATIVE_VIDEO=0` hard-disables it
for benchmarking the `<img>` path). The dylib is compiled automatically on first
use during `bun run dev` (cached in tmpdir, keyed by source hash), so there is no
separate build step. Start a channel and video is composited by the window
server instead of the `<img>`.

**Compositing (punch-through).** GPUI keeps its Metal layer as a sibling in the
window's content layer. The video layer is inserted **below** it
(`insertSublayer(at: 0)`, `zPosition = -1`), the window is created
`windowBackground: 'transparent'`, and while native video is active the app
paints the **player pane transparent** (root + pane backgrounds) — a
punch-through hole. GPUI's Metal layer is see-through there, so the video shows,
and GPUI's controls/spinner (opaque pixels) composite **on top**, so they stay
visible. Everything else (sidebar, dialogs) keeps its own opaque background, so
with native video off the window still looks fully opaque.

App Nap is disabled while playing (`ProcessInfo.beginActivity`,
`gpiux_video_set_playing`) so a minimized/backgrounded window keeps decoding
instead of stalling under `bun run dev`.

- `native/video-layer.swift` — an `AVSampleBufferDisplayLayer` inserted into the
  app's `NSWindow`. C ABI (`@_cdecl`): `attach`, `detach`, `set_rect`,
  `set_hidden`, `present(ptr, w, h, stride)`. Fresh IOSurface-backed
  `CVPixelBuffer` per frame (a pool would block the frame loop when buffers are
  still enqueued), enqueued for immediate display.
- `src/native-video.ts` — compiles the dylib once (cached in tmpdir, keyed by
  source hash) and loads it via `bun:ffi`; frames pass by pointer (zero copy
  across the boundary). Inert off macOS or without the env flag.
- `src/use-native-video.ts` — attaches on mount, points `StreamPlayer`'s frame
  sink at the layer, keeps it positioned over the player pane
  (`useWindowSize` + sidebar inset) and shown only while a channel is active.
- `src/player.ts` (`setNativeSink`) + `src/frame.ts` (`sampleToBgra`) — when the
  sink is set, decoded frames are handed over as raw BGRA and **never** encoded
  to a data URL, so the renderer's per-frame image path is fully bypassed. The
  native path decodes near source resolution (`NATIVE_MAX_WIDTH` 1920), not the
  640 px `<img>` cap.

**Measured:** a live 1280×720 stream through the native surface holds RSS flat
at ~170–280 MB, versus 1–2.5 GB for the `<img>` path at the same resolution —
and at full resolution rather than downscaled.

**Notes / limitations.** Controls and the loading spinner stay visible via the
punch-through described above (video below, transparent pane, GPUI on top). The
whole window is transparent, so any surface that should be opaque must paint its
own background — the sidebar, dialogs, and (when native video is off) the player
pane already do. The dylib is compiled from `native/video-layer.swift` at
runtime, so this currently requires running from the repo (source present); a
`bun build --compile` binary would need the Swift source embedded or shipped
alongside.

## Pinpointing the residual in a real session

Because it needs hours, capture it in the real app rather than a harness:

1. Run the packaged app on a real channel and log `process.memoryUsage().rss`
   every 30 s to a file for 1–2 h.
2. Bisect conditions: EPG off vs on; a single channel untouched vs periodic
   channel switching; live vs VOD; `STREAMER_MAX_FRAME_WIDTH=320` (near-flat in
   tests) vs 640 — if 320 also climbs to GB, the residual is **not** the frame
   images and the search moves to the full-app render layer; if only larger
   widths climb, it is the image path and Option A/C is the fix.
3. If it correlates with channel switches, audit `resetInternal()` disposal
   (mediabunny `Input.dispose`, sinks, the `unhandledRejection` guard).
