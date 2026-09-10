import { SIDEBAR_VIEWS, type SidebarView } from "../../settings/app-settings";
import { ActionButton, Icon, SettingToggle, useAsyncAction } from "../components/primitives";
import { C, FONT } from "../theme";

export function GeneralPanel({
  defaultSidebarView,
  onDefaultSidebarView,
  nativeVideo,
  nativeVideoSupported,
  onNativeVideo,
  baseFolder,
  resolvedBaseFolder,
  onPickBaseFolder,
  onSetBaseFolder,
}: {
  defaultSidebarView: SidebarView;
  onDefaultSidebarView: (view: SidebarView) => Promise<void>;
  nativeVideo: boolean;
  nativeVideoSupported: boolean;
  onNativeVideo: (enabled: boolean) => Promise<void>;
  baseFolder: string | null;
  resolvedBaseFolder: string;
  onPickBaseFolder: () => Promise<string | null>;
  onSetBaseFolder: (dir: string | null) => Promise<void>;
}) {
  const { busy, error, run } = useAsyncAction();

  const chooseFolder = () => {
    if (busy) return;
    void onPickBaseFolder().then((dir) => {
      if (dir) run(onSetBaseFolder(dir));
    });
  };

  return (
    <div style={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <text
          style={{
            fontSize: 13,
            fontFamily: FONT,
            fontWeight: "600",
            color: C.text,
            paddingLeft: 2,
          }}
        >
          Base folder
        </text>
        <text style={{ fontSize: 12, fontFamily: FONT, color: C.secondary, paddingLeft: 2 }}>
          Where your playlists, channels, and cache are stored. Changing it reloads the catalog from
          the new location.
        </text>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            minHeight: 40,
            paddingLeft: 12,
            paddingRight: 8,
            borderRadius: 10,
            backgroundColor: C.raised,
            borderWidth: 1,
            borderColor: C.border,
          }}
        >
          <text
            testId="base-folder-path"
            style={{
              flexGrow: 1,
              minWidth: 0,
              fontSize: 12,
              fontFamily: FONT,
              color: baseFolder ? C.text : C.tertiary,
            }}
          >
            {baseFolder ?? `Default · ${resolvedBaseFolder}`}
          </text>
          <ActionButton
            icon="folderPlus"
            label="Choose…"
            testId="base-folder-choose"
            onClick={chooseFolder}
          />
          {baseFolder ? (
            <ActionButton
              icon="refresh"
              label="Reset"
              testId="base-folder-reset"
              onClick={() => {
                if (busy) return;
                run(onSetBaseFolder(null));
              }}
            />
          ) : null}
        </div>
      </div>
      {nativeVideoSupported ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <SettingToggle
            label="Hardware video surface"
            hint="Composite video on the GPU (macOS). Keeps memory flat at full resolution; on-video controls are hidden while playing."
            checked={nativeVideo}
            testId="native-video-toggle"
            onChange={(next) => {
              if (busy) return;
              run(onNativeVideo(next));
            }}
          />
        </div>
      ) : null}
      <text style={{ fontSize: 12, fontFamily: FONT, color: C.secondary, paddingLeft: 2 }}>
        Choose which channel list view opens when you start the app.
      </text>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {SIDEBAR_VIEWS.map((entry) => {
          const active = entry.id === defaultSidebarView;
          return (
            <div
              key={entry.id}
              testId={`default-sidebar-view-${entry.id}`}
              onClick={() => {
                if (active || busy) return;
                run(onDefaultSidebarView(entry.id));
              }}
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                minHeight: 44,
                paddingLeft: 12,
                paddingRight: 12,
                borderRadius: 12,
                cursor: "pointer",
                backgroundColor: active ? C.accentSoft : C.raised,
                borderWidth: 1,
                borderColor: active ? C.accent : C.border,
                hover: active ? undefined : { backgroundColor: C.overlay },
              }}
            >
              <text
                style={{
                  flexGrow: 1,
                  fontSize: 13,
                  fontFamily: FONT,
                  fontWeight: active ? "600" : "500",
                  color: C.text,
                }}
              >
                {entry.label}
              </text>
              {active ? <Icon name="check" size={16} color={C.accent} /> : null}
            </div>
          );
        })}
      </div>
      {error ? (
        <text style={{ fontSize: 12, fontFamily: FONT, color: C.accent }}>{error}</text>
      ) : null}
    </div>
  );
}
