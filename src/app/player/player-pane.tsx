import { basename } from "node:path";
import { useRef, useState, type ReactNode } from "react";
import { countryLabel } from "../../geo/countries";
import type { Channel } from "../../catalog";
import { playerFocusedRef } from "../focus";
import { seekBarModel } from "../utils";
import type { EpgProgramme } from "../../epg/xmltv";
import type { StreamPlayer, PlayerState } from "../../player";
import type { VideoFit } from "../../media/native-video";
import { useWallClock } from "../../lib/react-sync";
import { videoFitIcon, videoFitLabel, videoFitTestId } from "../video-fit";
import { ChannelMark, ChannelNumber } from "../components/channel";
import { Icon, IconButton, Spinner } from "../components/primitives";
import { SeekBar } from "./seek-bar";
import { VideoPicture } from "./video-picture";
import { VolumeSlider } from "./volume-slider";
import {
  C,
  FONT,
  LIVE_EDGE_SNAP,
  PLAYER_HEADER_LEFT,
  PLAYER_HEADER_LEFT_FULLSCREEN,
  PLAYER_HEADER_TOP,
} from "../theme";

function PlayerChromeOverlay({
  edge,
  visible,
  fullscreen: _fullscreen,
  headerLeft,
  children,
}: {
  edge: "top" | "bottom";
  visible: boolean;
  fullscreen: boolean;
  headerLeft?: number;
  children: ReactNode;
}) {
  const top = edge === "top";
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        ...(top ? { top: 0 } : { bottom: 0 }),
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        backgroundColor: "#000000CC",
        ...(top
          ? {
              paddingTop: PLAYER_HEADER_TOP,
              paddingLeft: headerLeft ?? PLAYER_HEADER_LEFT,
              paddingRight: 18,
              paddingBottom: 16,
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }
          : {
              paddingLeft: 18,
              paddingRight: 18,
              paddingTop: 28,
              paddingBottom: 16,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }),
      }}
    >
      {children}
    </div>
  );
}

export function PlayerPane({
  channel,
  state,
  player,
  nativeVideoActive,
  fullscreen,
  programme,
  epgEnabled,
  onToggle,
  onLive,
  onMute,
  onVolume,
  onSeek,
  onSkip,
  onPrev,
  onNext,
  onFullscreen,
  onGuide,
  videoFit,
  onCycleVideoFit,
}: {
  channel: Channel | null;
  state: PlayerState;
  player: StreamPlayer | null;
  nativeVideoActive: boolean;
  fullscreen: boolean;
  programme: EpgProgramme | null;
  epgEnabled: boolean;
  videoFit: VideoFit;
  onToggle: () => void;
  onLive: () => void;
  onMute: () => void;
  onVolume: (value: number) => void;
  onSeek: (time: number) => void;
  onSkip: (seconds: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onFullscreen: () => void;
  onGuide: () => void;
  onCycleVideoFit: () => void;
}) {
  const ready = state.status === "ready";
  const nearLive = state.live && state.end - state.time <= LIVE_EDGE_SNAP;
  const [hovered, setHovered] = useState(true);
  const [prevFullscreen, setPrevFullscreen] = useState(fullscreen);
  const [prevPlaying, setPrevPlaying] = useState(state.playing);
  const wallNow = useWallClock(1_000, epgEnabled && !!programme);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-hide the chrome only during active playback (windowed or fullscreen);
  // when paused/loading/idle the controls and title stay put.
  const autoHide = state.playing;
  const armHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (autoHide) hideTimer.current = setTimeout(() => setHovered(false), 2400);
  };

  if (fullscreen !== prevFullscreen) {
    setPrevFullscreen(fullscreen);
    setHovered(true);
    armHide();
  }

  // When playback starts, reveal the chrome then let it fade; when it stops,
  // keep it visible.
  if (state.playing !== prevPlaying) {
    setPrevPlaying(state.playing);
    setHovered(true);
    armHide();
  }

  // Only react to genuine cursor movement. When the chrome shows/hides, the
  // overlays appear/disappear under a stationary cursor and GPUI fires
  // mouseenter/mouseleave at the SAME position; treating those as activity made
  // the controls blink and kept the inactivity timer from ever elapsing.
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const reveal = (event?: { x?: number; y?: number }) => {
    const x = event?.x ?? -1;
    const y = event?.y ?? -1;
    if (lastPos.current && lastPos.current.x === x && lastPos.current.y === y) return;
    lastPos.current = { x, y };
    playerFocusedRef.current = true;
    if (!hovered) setHovered(true);
    armHide();
  };

  const showChrome = hovered || !autoHide;
  const playerHeaderLeft = fullscreen ? PLAYER_HEADER_LEFT_FULLSCREEN : PLAYER_HEADER_LEFT;
  // Everything the seek bar shows (EPG programme window vs live DVR vs VOD, the
  // rewind circle, and how a dragged position maps back to a media timestamp).
  const seek = seekBarModel({
    ready,
    live: state.live,
    seekable: state.seekable,
    start: state.start,
    end: state.end,
    time: state.time,
    unixOffset: state.unixOffset,
    programme: epgEnabled ? programme : null,
    nowMs: wallNow,
  });
  const channelMeta =
    channel?.group ??
    (channel?.country
      ? countryLabel(channel.country.split(";")[0] ?? "")
      : channel
        ? basename(channel.sourceFile)
        : "");
  const headerSubtitle =
    epgEnabled && programme
      ? [channel?.name, channelMeta].filter(Boolean).join(" · ")
      : channelMeta || "Pick a channel from the list";

  return (
    <div
      testId="player"
      onMouseMove={reveal}
      style={{
        flexGrow: 1,
        minWidth: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        // Transparent while native video is active: the picture comes from the
        // native layer behind the window, and GPUI chrome draws on top.
        backgroundColor: nativeVideoActive ? "transparent" : C.player,
        position: "relative",
      }}
    >
      <div
        testId="video-stage"
        onClick={onToggle}
        onMouseMove={reveal}
        style={{
          flexGrow: 1,
          minHeight: 0,
          minWidth: 0,
          position: "relative",
          backgroundColor: nativeVideoActive ? "transparent" : C.player,
        }}
      >
        {nativeVideoActive ? null : <VideoPicture player={player} objectFit={videoFit} />}
        {fullscreen && !showChrome ? (
          <div
            testId="fullscreen-hit"
            onClick={onToggle}
            onMouseMove={reveal}
            style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}
          />
        ) : null}
        {state.status === "idle" || state.status === "error" ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              pointerEvents: "none",
            }}
          >
            <Icon name="play" size={26} color={C.ghost} />
            <text
              testId="player-empty"
              style={{ fontSize: 14, fontFamily: FONT, color: C.tertiary }}
            >
              {state.status === "error"
                ? (state.error ?? "Could not open this stream")
                : "Select a channel to play"}
            </text>
          </div>
        ) : state.status === "loading" ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              pointerEvents: "none",
            }}
          >
            <Spinner />
            <text
              testId="player-empty"
              style={{ fontSize: 12, fontFamily: FONT, color: C.secondary }}
            >
              Opening stream…
            </text>
          </div>
        ) : null}
      </div>

      <PlayerChromeOverlay
        edge="top"
        visible={showChrome}
        fullscreen={fullscreen}
        headerLeft={playerHeaderLeft}
      >
        {channel ? <ChannelMark channel={channel} size={34} /> : null}
        {channel?.chno ? <ChannelNumber chno={channel.chno} /> : null}
        <div
          style={{
            flexGrow: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            alignItems: "flex-start",
          }}
        >
          <text
            style={{
              fontSize: 16,
              fontFamily: FONT,
              fontWeight: "600",
              color: C.text,
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              textAlign: "left",
              width: "100%",
            }}
          >
            {epgEnabled && programme ? programme.title : (channel?.name ?? "No channel")}
          </text>
          <text
            style={{
              fontSize: 11,
              fontFamily: FONT,
              color: C.ghost,
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              textAlign: "left",
              width: "100%",
            }}
          >
            {headerSubtitle}
          </text>
        </div>
        {epgEnabled && channel ? (
          <div
            testId="open-guide"
            onClick={onGuide}
            style={{
              height: 28,
              paddingLeft: 10,
              paddingRight: 10,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
              backgroundColor: C.raised,
              hover: { backgroundColor: C.overlayStrong },
            }}
          >
            <text style={{ fontSize: 11, fontFamily: FONT, fontWeight: "600", color: C.secondary }}>
              Guide
            </text>
          </div>
        ) : null}
        <div
          testId={videoFitTestId(videoFit)}
          onClick={onCycleVideoFit}
          style={{
            height: 28,
            paddingLeft: 8,
            paddingRight: 10,
            borderRadius: 8,
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            backgroundColor: C.raised,
            hover: { backgroundColor: C.overlayStrong },
          }}
        >
          <Icon name={videoFitIcon(videoFit)} size={14} color={C.text} />
          <text style={{ fontSize: 10, fontFamily: FONT, fontWeight: "600", color: C.secondary }}>
            {videoFitLabel(videoFit)}
          </text>
        </div>
        <IconButton
          icon={fullscreen ? "minimize" : "maximize"}
          testId={fullscreen ? "exit-fullscreen" : "fullscreen"}
          onClick={onFullscreen}
          color={C.text}
        />
      </PlayerChromeOverlay>

      <PlayerChromeOverlay edge="bottom" visible={showChrome} fullscreen={fullscreen}>
        {state.error ? (
          <text style={{ fontSize: 12, fontFamily: FONT, color: C.accent }}>{state.error}</text>
        ) : state.warning ? (
          <text style={{ fontSize: 12, fontFamily: FONT, color: C.secondary }}>
            {state.warning}
          </text>
        ) : null}

        <SeekBar
          time={seek.time}
          start={seek.start}
          end={seek.end}
          ready={ready}
          seekable={seek.seekable}
          pinLive={seek.pinLive}
          startLabel={seek.startLabel}
          endLabel={seek.endLabel}
          onSeek={(displayTime) => onSeek(seek.toMedia(displayTime))}
        />

        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
          <IconButton icon="chevronLeft" testId="prev-channel" onClick={onPrev} color={C.text} />
          <div
            testId="skip-back"
            onClick={() => onSkip(-15)}
            style={{
              height: 28,
              paddingLeft: 8,
              paddingRight: 8,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
              hover: { backgroundColor: C.overlay },
            }}
          >
            <text style={{ fontSize: 11, fontFamily: FONT, color: C.secondary }}>-15s</text>
          </div>
          <div
            testId="play-pause"
            onClick={onToggle}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: C.text,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              hover: { backgroundColor: "#FFFFFF" },
            }}
          >
            <Icon name={state.playing ? "pause" : "play"} size={16} color={C.player} />
          </div>
          <div
            testId="skip-forward"
            onClick={() => onSkip(15)}
            style={{
              height: 28,
              paddingLeft: 8,
              paddingRight: 8,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
              hover: { backgroundColor: C.overlay },
            }}
          >
            <text style={{ fontSize: 11, fontFamily: FONT, color: C.secondary }}>+15s</text>
          </div>
          <IconButton icon="chevronRight" testId="next-channel" onClick={onNext} color={C.text} />
          <text style={{ fontSize: 13, fontFamily: FONT, color: C.text, marginLeft: 6 }}>
            {seek.timeLabel}
          </text>

          <div style={{ flexGrow: 1 }} />

          {state.live ? (
            <div
              testId="go-live"
              onClick={onLive}
              style={{
                height: 28,
                paddingLeft: 10,
                paddingRight: 12,
                borderRadius: 14,
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: 7,
                cursor: "pointer",
                backgroundColor: nearLive ? C.accentSoft : C.raised,
                hover: { backgroundColor: C.overlayStrong },
              }}
            >
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  flexShrink: 0,
                  backgroundColor: nearLive ? C.live : C.ghost,
                }}
              />
              <text
                style={{
                  fontSize: 11,
                  fontFamily: FONT,
                  fontWeight: "600",
                  color: nearLive ? C.live : C.secondary,
                }}
              >
                LIVE
              </text>
            </div>
          ) : null}

          <IconButton
            icon={state.muted ? "volumeX" : "volume"}
            testId="mute"
            onClick={onMute}
            color={C.secondary}
            size={30}
          />
          <VolumeSlider value={state.muted ? 0 : state.volume} onChange={onVolume} />
        </div>
      </PlayerChromeOverlay>
    </div>
  );
}
