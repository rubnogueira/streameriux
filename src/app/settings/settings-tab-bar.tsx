import { SETTINGS_TABS, type SettingsTab } from "../../settings/app-settings";
import { C, FONT } from "../theme";

export function SettingsTabBar({
  tab,
  onTab,
}: {
  tab: SettingsTab;
  onTab: (tab: SettingsTab) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        gap: 2,
        padding: 3,
        borderRadius: 10,
        backgroundColor: C.raised,
        borderWidth: 1,
        borderColor: C.border,
      }}
    >
      {SETTINGS_TABS.map((entry) => {
        const active = entry.id === tab;
        return (
          <div
            key={entry.id}
            testId={`settings-tab-${entry.id}`}
            onClick={() => onTab(entry.id)}
            style={{
              flexGrow: 1,
              height: 28,
              borderRadius: 7,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              backgroundColor: active ? C.overlayStrong : undefined,
              hover: active ? undefined : { backgroundColor: C.overlay },
            }}
          >
            <text
              style={{
                fontSize: 12,
                fontFamily: FONT,
                fontWeight: active ? "600" : "500",
                color: active ? C.text : C.tertiary,
              }}
            >
              {entry.label}
            </text>
          </div>
        );
      })}
    </div>
  );
}
