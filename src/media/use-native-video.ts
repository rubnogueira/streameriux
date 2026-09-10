import { useRef } from 'react'
import { useWindowSize } from '@gpuix/react'
import { useBootstrap } from '../lib/react-sync'
import { loadNativeVideo, nativeVideoSupported, videoFitMode, type NativeVideo, type VideoFit } from './native-video'
import type { StreamPlayer } from '../player'

type State = {
  nv: NativeVideo | null
  loaded: boolean
  engaged: boolean
  rect: string
  hidden: boolean | null
  fit: VideoFit | null
}

/**
 * Drive the native video surface (README Option A) from the app. When enabled
 * and supported, decoded frames are composited by the window server via an
 * AVSampleBufferDisplayLayer instead of blitted through GPUIX's `<img>`, so
 * frame memory stays flat at full resolution. The `enabled` flag comes from the
 * user setting, so toggling it engages/disengages the surface live.
 *
 * Returns whether the native surface is currently active; when true the `<img>`
 * picture path is bypassed and the renderer never sees a frame.
 */
export function useNativeVideo(
  player: StreamPlayer | null,
  opts: { enabled: boolean; leftInset: number; videoFit?: VideoFit },
): boolean {
  const ref = useRef<State>({ nv: null, loaded: false, engaged: false, rect: '', hidden: null, fit: null })
  const state = ref.current
  const videoFit = opts.videoFit ?? 'contain'

  if (!state.loaded) {
    state.loaded = true
    state.nv = nativeVideoSupported() ? loadNativeVideo() : null
  }

  // Detach cleanly on unmount so the layer and sink never outlive the app.
  useBootstrap(() => () => {
    if (state.engaged && state.nv && player) {
      player.setNativeSink(null)
      try {
        state.nv.detach()
      } catch {
        // already gone
      }
    }
    state.engaged = false
  })

  const size = useWindowSize()
  const active = opts.enabled && !!state.nv && !!player

  if (active) {
    if (!state.engaged) {
      const nv = state.nv!
      player!.setNativeSink((pixels, width, height, stride) => nv.present(pixels, width, height, stride))
      state.engaged = true
      state.rect = ''
      state.hidden = null
      state.fit = null
    }
    const x = Math.max(0, opts.leftInset)
    const w = Math.max(0, size.width - x)
    const rect = `${x},${w},${size.height}`
    if (rect !== state.rect) {
      state.rect = rect
      state.nv!.attach()
      state.nv!.setRect(x, 0, w, size.height)
    }
    if (state.fit !== videoFit) {
      state.fit = videoFit
      state.nv!.setFit(videoFitMode(videoFit))
    }
    if (state.hidden !== false) {
      state.hidden = false
      state.nv!.setHidden(false)
    }
  } else if (state.engaged) {
    player?.setNativeSink(null)
    try {
      state.nv?.detach()
    } catch {
      // already gone
    }
    state.engaged = false
    state.fit = null
  }

  return active && state.engaged
}
