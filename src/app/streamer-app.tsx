import { useCallback, useMemo, useRef, useState } from "react";
import { useBootstrap, useMountRef, useWallClock } from "../lib/react-sync";
import { NATIVE_VIDEO_SUPPORTED, useAppSettings } from "../settings/app-settings";
import { useCatalog, type Channel } from "../catalog";
import { pickCatalogFileNative, pickCatalogFolderNative } from "../lib/file-dialog";
import { isNativeFullscreenForProcess, setNativeFullscreenForProcess } from "../lib/fullscreen";
import { startMediaSession, type MediaSessionController } from "../media/media-session";
import { useNativeVideo } from "../media/use-native-video";
import { setPlaybackActive } from "../media/native-video";
import { useEpg } from "../epg/use-epg";
import { StreamPlayer } from "../player";
import { dragRouter, keyRouter, playerFocusedRef, textInputIsFocused } from "./focus";
import {
  idlePlayer,
  C,
  SIDEBAR_WIDTH,
  SIDEBAR_TOP_INSET,
  SIDEBAR_SIDE_INSET,
  IS_MAC,
} from "./theme";
import { IconButton } from "./components/primitives";
import { Sidebar } from "./sidebar/sidebar";
import { PlayerPane } from "./player/player-pane";
import { SettingsDialog } from "./settings/settings-dialog";
import { EpgGuidePanel } from "./epg/epg-guide-panel";
import type { PlayerState } from "../player";
import type { VideoFit } from "../media/native-video";
import { cycleVideoFit } from "./video-fit";

export function StreamerApp() {
  const catalog = useCatalog();
  const appSettings = useAppSettings();
  const epg = useEpg(catalog.sources, catalog.channels, catalog.loading);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [playerState, setPlayerState] = useState<PlayerState>(idlePlayer);
  const [dialog, setDialog] = useState<"settings" | "guide" | null>(null);
  const [videoFit, setVideoFit] = useState<VideoFit>("contain");
  const [fullscreen, setFullscreen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [, setNativeFullscreenState] = useState(false);
  const [player] = useState(() => new StreamPlayer(setPlayerState));
  const playerRef = useRef(player);
  const mediaSessionRef = useRef<MediaSessionController | null>(null);
  const mediaSessionPlaybackRef = useRef<{ channel: Channel | null; state: PlayerState }>({
    channel: null,
    state: idlePlayer,
  });
  const stepRef = useRef<(delta: number) => void>(() => {});
  const fullscreenRef = useRef(false);
  const selectedIdRef = useRef<string | null>(null);
  const channelsRef = useRef<Channel[]>([]);
  const dialogRef = useRef<"settings" | "guide" | null>(null);

  playerRef.current = player;

  const visibleChannelList = catalog.channels;

  selectedIdRef.current = selectedId;
  channelsRef.current = visibleChannelList;
  fullscreenRef.current = fullscreen;
  dialogRef.current = dialog;

  const selected = visibleChannelList.find((channel) => channel.id === selectedId) ?? null;
  const currentProgramme = selected && epg.enabled ? epg.getNow(selected) : null;

  // Native hardware-composited video surface (README Option A / docs/video-memory.md).
  // When active, decoded frames go to an AVSampleBufferDisplayLayer over the
  // player pane instead of through GPUIX's `<img>`, so frame memory stays flat.
  const nativeChannelUp =
    !!selected && playerState.status !== "idle" && playerState.status !== "error";
  const showSidebar = !fullscreen && !sidebarCollapsed;
  const nativeVideoActive = useNativeVideo(player, {
    enabled: appSettings.settings.nativeVideo,
    leftInset: showSidebar ? SIDEBAR_WIDTH : 0,
    videoFit,
  });
  // Only punch a transparent hole while the native layer is actually shown; when
  // idle/error the layer is hidden, so the pane must stay opaque (otherwise the
  // idle placeholder would show the desktop through the window).
  const nativeVideoShowing = nativeVideoActive && nativeChannelUp;

  // Keep the process off App Nap while playing so a minimized window keeps
  // decoding audio/video instead of stalling.
  const playbackActiveRef = useRef<boolean | null>(null);
  if (playbackActiveRef.current !== playerState.playing) {
    playbackActiveRef.current = playerState.playing;
    setPlaybackActive(playerState.playing);
  }

  mediaSessionPlaybackRef.current = { channel: selected, state: playerState };

  const sourceCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const channel of catalog.channels) {
      map.set(channel.sourceFile, (map.get(channel.sourceFile) ?? 0) + 1);
    }
    return map;
  }, [catalog.channels]);

  const select = useCallback((channel: Channel) => {
    setSelectedId(channel.id);
    void playerRef.current?.open(channel.id, channel.url, {
      userAgent: channel.userAgent,
      referrer: channel.referrer,
      headers: channel.headers,
    });
  }, []);
  const openSettings = useCallback(() => setDialog("settings"), []);
  const refreshCatalog = useCallback(() => {
    void catalog.refresh();
    void epg.syncNow(true);
  }, [catalog.refresh, epg.syncNow]);

  const step = (delta: number) => {
    const list = channelsRef.current;
    if (list.length === 0) return;
    const current = selectedIdRef.current;
    const index = Math.max(
      0,
      list.findIndex((channel) => channel.id === current),
    );
    const next = list[(index + delta + list.length) % list.length];
    if (next) select(next);
  };
  stepRef.current = step;

  if (
    !catalog.loading &&
    selectedId &&
    !visibleChannelList.some((channel) => channel.id === selectedId)
  ) {
    setSelectedId(visibleChannelList[0]?.id ?? null);
  }

  useBootstrap(() => {
    let active = true;
    void startMediaSession({
      play: () => void playerRef.current?.play(),
      pause: () => playerRef.current?.pause(),
      toggle: () => playerRef.current?.toggle(),
      next: () => stepRef.current(1),
      previous: () => stepRef.current(-1),
    }).then((controller) => {
      if (!active) {
        controller.dispose();
        return;
      }
      mediaSessionRef.current = controller;
      const { channel, state } = mediaSessionPlaybackRef.current;
      if (!channel || state.status === "idle" || state.status === "error") {
        controller.clear();
      } else {
        controller.update(channel, state);
      }
    });
    return () => {
      active = false;
      mediaSessionRef.current?.dispose();
      mediaSessionRef.current = null;
    };
  });

  const mediaSessionController = mediaSessionRef.current;
  if (mediaSessionController) {
    if (!selected || playerState.status === "idle" || playerState.status === "error") {
      mediaSessionController.clear();
    } else {
      mediaSessionController.update(selected, playerState, currentProgramme);
    }
  }

  const enterFullscreen = () => {
    if (fullscreenRef.current) return;
    fullscreenRef.current = true;
    setFullscreen(true);
    // If native fullscreen actually engages, the traffic lights are gone and the
    // chrome need not clear them; if it doesn't (e.g. AppKit binding unavailable),
    // we stay windowed-immersive and must keep clearing them.
    void setNativeFullscreenForProcess(true).then((ok) => setNativeFullscreenState(ok));
  };

  const exitFullscreen = () => {
    if (!fullscreenRef.current) return;
    fullscreenRef.current = false;
    setFullscreen(false);
    setNativeFullscreenState(false);
    void setNativeFullscreenForProcess(false);
  };

  const toggleFullscreen = () => {
    if (fullscreenRef.current) exitFullscreen();
    else enterFullscreen();
  };

  const toggleSidebarCollapsed = () => setSidebarCollapsed((collapsed) => !collapsed);

  // Keep the in-app immersive layout in step with the real window when the user
  // leaves native fullscreen another way (green button, Ctrl+Cmd+F, swipe), so
  // the sidebar comes back instead of staying hidden. Only polls while we think
  // we are fullscreen, so it costs nothing during normal use.
  const nativeFullscreenPoll = useWallClock(1000, fullscreen && IS_MAC);
  const lastNativePollRef = useRef(0);
  if (fullscreen && IS_MAC && nativeFullscreenPoll !== lastNativePollRef.current) {
    lastNativePollRef.current = nativeFullscreenPoll;
    void isNativeFullscreenForProcess().then((native) => {
      setNativeFullscreenState(native === true);
      if (native === false && fullscreenRef.current) {
        fullscreenRef.current = false;
        setFullscreen(false);
      }
    });
  }

  keyRouter.current = (event) => {
    const key = (event.key ?? event.code ?? "").toLowerCase();
    const instance = playerRef.current;
    if (!instance) return;
    if (key === "escape") {
      setDialog(null);
      exitFullscreen();
      return;
    }
    // While typing in a text field, let the field own every other key so search
    // text isn't hijacked by player shortcuts (space toggles playback, arrows
    // skip/adjust volume, k/l/m/f/[/]/p/n, …).
    if (textInputIsFocused()) return;
    if (key === "g" || key === "keyg") {
      if (dialogRef.current === "settings") return;
      if (!playerFocusedRef.current && dialogRef.current !== "guide") return;
      if (selectedIdRef.current) setDialog((current) => (current === "guide" ? null : "guide"));
    } else if (key === " " || key === "space" || key === "k" || key === "keyk") instance.toggle();
    else if (key === "l" || key === "keyl") void instance.goLive();
    else if (key === "m" || key === "keym") instance.toggleMute();
    else if (key === "f" || key === "keyf") toggleFullscreen();
    else if (key === "arrowleft") void instance.skip(-15);
    else if (key === "arrowright") void instance.skip(15);
    else if (key === "arrowup") instance.setVolume(instance.state.volume + 0.1);
    else if (key === "arrowdown") instance.setVolume(instance.state.volume - 0.1);
    else if (key === "[" || key === "p" || key === "keyp" || key === "pageup") step(-1);
    else if (key === "]" || key === "n" || key === "keyn" || key === "pagedown") step(1);
  };

  const appMountRef = useMountRef(() => {
    return () => {
      void playerRef.current?.stop();
      keyRouter.current = null;
    };
  }, []);

  return (
    <div
      ref={appMountRef}
      testId="app"
      onMouseMove={(event) => dragRouter.current?.move(event)}
      onMouseUp={(event) => {
        if (!dragRouter.current) return;
        dragRouter.current.end(event);
      }}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "row",
        width: "100%",
        height: "100%",
        // Transparent when native video is showing so its layer shows through the
        // player pane; the sidebar and player chrome paint their own opaque
        // backgrounds, so nothing else becomes see-through.
        backgroundColor: nativeVideoShowing ? "transparent" : C.canvas,
      }}
    >
      {showSidebar ? (
        <Sidebar
          channels={visibleChannelList}
          selectedId={selectedId}
          query={query}
          loading={catalog.loading}
          usePlaylistGroups={catalog.usePlaylistGroups}
          groupAssignments={catalog.groupAssignments}
          epgEnabled={epg.enabled}
          epgSyncLabel={epg.syncLabel}
          getNow={epg.getNow}
          onQuery={setQuery}
          onSelect={select}
          onSettings={openSettings}
          onRefresh={refreshCatalog}
          onToggleFavorite={(channel) => void catalog.toggleFavorite(channel)}
          onToggleCollapsed={toggleSidebarCollapsed}
          catalogError={catalog.error}
          defaultSidebarView={appSettings.settings.defaultSidebarView}
        />
      ) : null}
      <PlayerPane
        channel={selected}
        state={playerState}
        player={player}
        nativeVideoActive={nativeVideoShowing}
        fullscreen={fullscreen}
        sidebarCollapsed={sidebarCollapsed}
        programme={currentProgramme}
        epgEnabled={epg.enabled}
        onToggle={() => playerRef.current?.toggle()}
        onLive={() => void playerRef.current?.goLive()}
        onMute={() => playerRef.current?.toggleMute()}
        onVolume={(value) => playerRef.current?.setVolume(value)}
        onSeek={(time) => void playerRef.current?.seek(time)}
        onSkip={(seconds) => void playerRef.current?.skip(seconds)}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        onFullscreen={toggleFullscreen}
        onGuide={() => setDialog((current) => (current === "guide" ? null : "guide"))}
        videoFit={videoFit}
        onCycleVideoFit={() => setVideoFit((current) => cycleVideoFit(current))}
      />
      {sidebarCollapsed && !fullscreen ? (
        // The menu is hidden, so the expand control lives as a native hamburger
        // pinned to the window's top-left (below the traffic lights). Rendered
        // after the player pane so it paints on top of it, not behind.
        <div style={{ position: "absolute", top: SIDEBAR_TOP_INSET, left: SIDEBAR_SIDE_INSET }}>
          <IconButton
            icon="menu"
            testId="expand-sidebar"
            onClick={toggleSidebarCollapsed}
            color={C.text}
            size={30}
          />
        </div>
      ) : null}
      {dialog === "settings" ? (
        <SettingsDialog
          sources={catalog.sources}
          channels={catalog.channels}
          groups={catalog.groups}
          usePlaylistGroups={catalog.usePlaylistGroups}
          groupAssignments={catalog.groupAssignments}
          counts={sourceCounts}
          epg={epg}
          defaultSidebarView={appSettings.settings.defaultSidebarView}
          onDefaultSidebarView={appSettings.setDefaultSidebarView}
          nativeVideo={appSettings.settings.nativeVideo}
          nativeVideoSupported={NATIVE_VIDEO_SUPPORTED}
          onNativeVideo={appSettings.setNativeVideo}
          baseFolder={catalog.baseFolder}
          resolvedBaseFolder={catalog.resolvedBaseFolder}
          onPickBaseFolder={pickCatalogFolderNative}
          onSetBaseFolder={catalog.setBaseFolder}
          onClose={() => setDialog(null)}
          onAddLink={(reference) =>
            catalog.addLink(reference, { intent: "playlist" }).then(() => undefined)
          }
          onDeleteSource={(source) =>
            catalog.deleteSource(source.id.replace(/^(file|playlist):/, ""))
          }
          onSaveChannel={(draft) => catalog.saveChannel(draft)}
          onDeleteChannel={catalog.deleteChannel}
          onAssignGroup={catalog.assignChannelGroup}
          onTogglePlaylistGroups={catalog.setUsePlaylistGroups}
          customGroupNames={catalog.customGroupNames}
          onAddCustomGroup={catalog.addCustomGroup}
          onRemoveCustomGroup={catalog.removeCustomGroup}
          onPickFile={pickCatalogFileNative}
        />
      ) : null}
      {dialog === "guide" && selected ? (
        <EpgGuidePanel channel={selected} epg={epg} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}
