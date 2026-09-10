import { ensureAppIconPng, readMacAppearance } from "../../lib/app-icon";
import { APP_NAME } from "../brand";
import { Icon } from "./primitives";
import { C, FONT } from "../theme";

export function AppBrand({ size = 28 }: { size?: number }) {
  const appearance = readMacAppearance();
  const icon = ensureAppIconPng(appearance, size * 2);

  return (
    <div
      style={{ display: "flex", flexDirection: "row", alignItems: "center", height: size, gap: 10 }}
    >
      {icon ? (
        <img
          src={icon}
          objectFit="contain"
          style={{
            width: size,
            height: size,
            flexShrink: 0,
            borderRadius: 8,
          }}
        />
      ) : (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: 8,
            flexShrink: 0,
            backgroundColor: C.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="broadcastTv" size={Math.round(size * 0.62)} color={C.onAccent} />
        </div>
      )}
      <text style={{ fontSize: 16, fontFamily: FONT, fontWeight: "600", color: C.text }}>
        {APP_NAME}
      </text>
    </div>
  );
}
