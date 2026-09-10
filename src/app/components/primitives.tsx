import { useState } from "react";
import { asyncActionErrorMessage } from "./async-action";
import type { ReactNode } from "react";
import { useWallClock } from "../../lib/react-sync";
import { textInputFocusProps } from "../focus";
import { ICONS, type IconName } from "../icons";
import { C, FONT } from "../theme";

const SPINNER_DOTS = 12;
const SPINNER_TICK_MS = 60;

export function Icon({ name, size = 15, color }: { name: IconName; size?: number; color: string }) {
  return <svg source={ICONS[name]} style={{ width: size, height: size, flexShrink: 0, color }} />;
}

export function IconButton({
  icon,
  onClick,
  testId,
  color = C.tertiary,
  size = 34,
}: {
  icon: IconName;
  onClick?: () => void;
  testId?: string;
  color?: string;
  size?: number;
}) {
  return (
    <div
      testId={testId}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: size / 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        hover: { backgroundColor: C.overlay },
        active: { backgroundColor: C.overlayStrong },
      }}
    >
      <Icon name={icon} color={color} />
    </div>
  );
}

export function AddChip({
  label,
  onClick,
  testId,
}: {
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <div
      testId={testId}
      onClick={onClick}
      style={{
        height: 28,
        paddingLeft: 12,
        paddingRight: 12,
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: C.accent,
        cursor: "pointer",
        hover: { backgroundColor: "#FF6E64" },
      }}
    >
      <text style={{ fontSize: 11, fontFamily: FONT, color: C.onAccent }}>{label}</text>
    </div>
  );
}
export function Spinner({ size = 46, color = C.text }: { size?: number; color?: string }) {
  const now = useWallClock(SPINNER_TICK_MS);
  const step = Math.floor(now / SPINNER_TICK_MS) % SPINNER_DOTS;
  const center = size / 2;
  const dotSize = Math.max(3, Math.round(size / 10));
  const radius = center - dotSize;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {Array.from({ length: SPINNER_DOTS }).map((_, i) => {
        const angle = (i / SPINNER_DOTS) * Math.PI * 2;
        const left = center + radius * Math.sin(angle) - dotSize / 2;
        const top = center - radius * Math.cos(angle) - dotSize / 2;
        const trail = (step - i + SPINNER_DOTS) % SPINNER_DOTS;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left,
              top,
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: color,
              opacity: 0.15 + 0.85 * (1 - trail / SPINNER_DOTS),
            }}
          />
        );
      })}
    </div>
  );
}
export function Overlay({
  children,
  onMouseEnter,
}: {
  children: ReactNode;
  onMouseEnter?: () => void;
}) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "#000000AA",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </div>
  );
}

export function ActionButton({
  icon,
  label,
  onClick,
  testId,
  primary,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  testId: string;
  primary?: boolean;
}) {
  return (
    <div
      testId={testId}
      onClick={onClick}
      style={{
        height: 34,
        paddingLeft: 12,
        paddingRight: 14,
        borderRadius: 9,
        flexShrink: 0,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        cursor: "pointer",
        backgroundColor: primary ? C.accent : C.raised,
        borderWidth: primary ? 0 : 1,
        borderColor: C.border,
        hover: { backgroundColor: primary ? "#FF6E64" : C.overlayStrong },
      }}
    >
      <Icon name={icon} size={14} color={primary ? C.onAccent : C.secondary} />
      <text
        style={{
          fontSize: 12,
          fontFamily: FONT,
          fontWeight: "600",
          color: primary ? C.onAccent : C.text,
        }}
      >
        {label}
      </text>
    </div>
  );
}

export function TextField({
  value,
  placeholder,
  testId,
  onChange,
  onSubmit,
}: {
  value: string;
  placeholder: string;
  testId?: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
}) {
  return (
    <div
      style={{
        flexGrow: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        height: 36,
        paddingLeft: 10,
        paddingRight: 10,
        borderRadius: 10,
        backgroundColor: C.raised,
        borderWidth: 1,
        borderColor: C.border,
      }}
    >
      <input
        testId={testId}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.value ?? "")}
        onSubmit={onSubmit}
        {...textInputFocusProps()}
        style={{ flexGrow: 1, fontSize: 12, fontFamily: FONT, color: C.text }}
      />
    </div>
  );
}

export function useAsyncAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = (task: Promise<unknown>, done?: () => void) => {
    setBusy(true);
    setError(null);
    void task
      .then(() => done?.())
      .catch((err: unknown) => setError(asyncActionErrorMessage(err)))
      .finally(() => setBusy(false));
  };
  return { busy, error, setError, run };
}
export function GroupChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        height: 26,
        paddingLeft: 10,
        paddingRight: 10,
        borderRadius: 13,
        display: "flex",
        alignItems: "center",
        cursor: "pointer",
        backgroundColor: active ? C.accentSoft : C.raised,
        borderWidth: 1,
        borderColor: active ? C.accent : C.border,
      }}
    >
      <text style={{ fontSize: 11, fontFamily: FONT, color: active ? C.live : C.secondary }}>
        {label}
      </text>
    </div>
  );
}
export function SettingToggle({
  label,
  hint,
  checked,
  testId,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  testId: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div
      testId={testId}
      onClick={() => onChange(!checked)}
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        minHeight: 44,
        paddingLeft: 10,
        paddingRight: 10,
        borderRadius: 10,
        cursor: "pointer",
        backgroundColor: C.raised,
        borderWidth: 1,
        borderColor: C.border,
        hover: { backgroundColor: C.overlay },
      }}
    >
      <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <text style={{ fontSize: 13, fontFamily: FONT, fontWeight: "500", color: C.text }}>
          {label}
        </text>
        {hint ? (
          <text style={{ fontSize: 11, fontFamily: FONT, color: C.ghost }}>{hint}</text>
        ) : null}
      </div>
      <div
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          backgroundColor: checked ? C.accent : C.track,
          display: "flex",
          alignItems: "center",
          paddingLeft: checked ? 18 : 2,
          paddingRight: checked ? 2 : 18,
        }}
      >
        <div style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: C.text }} />
      </div>
    </div>
  );
}
export function IntervalChip({
  label,
  active,
  onClick,
  testId,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <div
      testId={testId}
      onClick={onClick}
      style={{
        height: 26,
        paddingLeft: 10,
        paddingRight: 10,
        borderRadius: 13,
        display: "flex",
        alignItems: "center",
        cursor: "pointer",
        backgroundColor: active ? C.accentSoft : C.raised,
        borderWidth: 1,
        borderColor: active ? C.accent : C.border,
      }}
    >
      <text style={{ fontSize: 11, fontFamily: FONT, color: active ? C.live : C.secondary }}>
        {label}
      </text>
    </div>
  );
}
export function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minHeight: 32,
        paddingLeft: 10,
        paddingRight: 10,
        marginTop: 6,
      }}
    >
      <text
        style={{
          flexGrow: 1,
          fontSize: 11,
          fontFamily: FONT,
          fontWeight: "600",
          color: C.tertiary,
        }}
      >
        {label.toUpperCase()}
      </text>
      <text style={{ fontSize: 11, fontFamily: FONT, color: C.ghost }}>{String(count)}</text>
    </div>
  );
}
