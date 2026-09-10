import { useState } from "react";
import { COUNTRY_OPTIONS } from "../../geo/countries";
import type { Channel } from "../../catalog";
import { textInputFocusProps } from "../focus";
import { ActionButton, GroupChip, Icon, useAsyncAction } from "../components/primitives";
import { C, FONT } from "../theme";

export function EditorField({
  label,
  value,
  placeholder,
  readOnly,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  placeholder?: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  testId?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <text style={{ fontSize: 11, fontFamily: FONT, fontWeight: "600", color: C.tertiary }}>
        {label.toUpperCase()}
      </text>
      {readOnly ? (
        <div
          style={{
            minHeight: 36,
            paddingLeft: 10,
            paddingRight: 10,
            borderRadius: 10,
            backgroundColor: C.canvas,
            borderWidth: 1,
            borderColor: C.border,
            display: "flex",
            alignItems: "center",
          }}
        >
          <text
            style={{
              fontSize: 12,
              fontFamily: FONT,
              color: C.secondary,
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {value || "—"}
          </text>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
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
            onChange={(event) => onChange?.(event.value ?? "")}
            {...textInputFocusProps()}
            style={{ flexGrow: 1, fontSize: 12, fontFamily: FONT, color: C.text }}
          />
        </div>
      )}
    </div>
  );
}

export function CountrySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = COUNTRY_OPTIONS.find((option) => option.code === value);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <text style={{ fontSize: 11, fontFamily: FONT, fontWeight: "600", color: C.tertiary }}>
        COUNTRY
      </text>
      <div style={{ position: "relative" }}>
        <div
          testId="channel-country"
          onClick={() => setOpen((current) => !current)}
          style={{
            display: "flex",
            alignItems: "center",
            height: 36,
            paddingLeft: 10,
            paddingRight: 10,
            borderRadius: 10,
            backgroundColor: C.raised,
            borderWidth: 1,
            borderColor: open ? C.accent : C.border,
            cursor: "pointer",
          }}
        >
          <text
            style={{
              flexGrow: 1,
              fontSize: 12,
              fontFamily: FONT,
              color: selected ? C.text : C.tertiary,
            }}
          >
            {selected?.label ?? "Select country…"}
          </text>
          <text style={{ fontSize: 11, fontFamily: FONT, color: C.ghost }}>{open ? "▴" : "▾"}</text>
        </div>
        {open ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 40,
              maxHeight: 220,
              overflow: "scroll",
              borderRadius: 10,
              backgroundColor: C.sidebar,
              borderWidth: 1,
              borderColor: C.border,
              display: "flex",
              flexDirection: "column",
              gap: 1,
              padding: 4,
            }}
          >
            <div
              testId="channel-country-clear"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              style={{
                minHeight: 32,
                paddingLeft: 8,
                paddingRight: 8,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
                hover: { backgroundColor: C.overlay },
              }}
            >
              <text style={{ fontSize: 12, fontFamily: FONT, color: C.tertiary }}>No country</text>
            </div>
            {COUNTRY_OPTIONS.map((option) => (
              <div
                key={option.code}
                testId={`channel-country-${option.code}`}
                onClick={() => {
                  onChange(option.code);
                  setOpen(false);
                }}
                style={{
                  minHeight: 32,
                  paddingLeft: 8,
                  paddingRight: 8,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                  backgroundColor: option.code === value ? C.overlayStrong : undefined,
                  hover: option.code === value ? undefined : { backgroundColor: C.overlay },
                }}
              >
                <text style={{ fontSize: 12, fontFamily: FONT, color: C.text }}>
                  {option.label}
                </text>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export type ChannelDraft = {
  name: string;
  url: string;
  group: string;
  country: string;
  language: string;
  chno: string;
  icon: string;
};

export function draftFrom(channel: Channel | null): ChannelDraft {
  return {
    name: channel?.name ?? "",
    url: channel?.url ?? "",
    group: channel?.group ?? "",
    country: channel?.country?.split(";")[0]?.trim() ?? "",
    language: channel?.language ?? "",
    chno: channel?.chno ?? "",
    icon: channel?.icon ?? "",
  };
}

export function ChannelEditor({
  channel,
  groups,
  groupOnly = false,
  initialGroup,
  onBack,
  onSave,
  onAssignGroup,
  onDelete,
}: {
  channel: Channel | null;
  groups: string[];
  groupOnly?: boolean;
  initialGroup?: string;
  onBack: () => void;
  onSave: (draft: ChannelDraft) => Promise<void>;
  onAssignGroup?: (draft: ChannelDraft) => Promise<void>;
  onDelete: (() => Promise<void>) | null;
}) {
  const [draft, setDraft] = useState<ChannelDraft>(() => {
    const base = draftFrom(channel);
    if (initialGroup) return { ...base, group: initialGroup };
    return base;
  });
  const { busy, error, run } = useAsyncAction();
  const set = (patch: Partial<ChannelDraft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const isNew = channel === null;

  const save = () => {
    if (groupOnly && onAssignGroup) run(onAssignGroup(draft), onBack);
    else run(onSave(draft), onBack);
  };

  return (
    <div style={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
        <div
          testId="channel-editor-back"
          onClick={onBack}
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            cursor: "pointer",
          }}
        >
          <Icon name="chevronLeft" size={16} color={C.secondary} />
          <text style={{ fontSize: 13, fontFamily: FONT, fontWeight: "600", color: C.text }}>
            {groupOnly ? "Set group" : isNew ? "New channel" : "Edit channel"}
          </text>
        </div>
        <div style={{ flexGrow: 1 }} />
        {onDelete ? (
          <ActionButton
            icon="trash"
            label="Remove"
            testId="channel-editor-delete"
            onClick={() => run(onDelete(), onBack)}
          />
        ) : null}
        <ActionButton
          icon="check"
          label={busy ? "Saving…" : "Save"}
          testId="channel-editor-save"
          primary
          onClick={save}
        />
      </div>

      <div
        style={{
          flexGrow: 1,
          minHeight: 0,
          overflow: "scroll",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <EditorField
          label="Name"
          testId="channel-field-name"
          value={draft.name}
          placeholder="Channel name"
          readOnly={groupOnly}
          onChange={(v) => set({ name: v })}
        />
        <EditorField
          label="Stream URL"
          testId="channel-field-url"
          value={draft.url}
          placeholder="https://…/stream.m3u8"
          readOnly={!isNew || groupOnly}
          onChange={(v) => set({ url: v })}
        />
        <div style={{ display: "flex", flexDirection: "row", gap: 12 }}>
          <div style={{ flexGrow: 1 }}>
            <EditorField
              label="Category / group"
              testId="channel-field-group"
              value={draft.group}
              placeholder="e.g. Sports"
              onChange={(v) => set({ group: v })}
            />
          </div>
          {groupOnly ? null : (
            <div style={{ width: 140, flexShrink: 0 }}>
              <EditorField
                label="Channel no."
                testId="channel-field-chno"
                value={draft.chno}
                placeholder="12"
                onChange={(v) => set({ chno: v })}
              />
            </div>
          )}
        </div>
        {groups.length ? (
          <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {groups.slice(0, 40).map((name) => (
              <GroupChip
                key={name}
                label={name}
                active={draft.group === name}
                onClick={() => set({ group: name })}
              />
            ))}
          </div>
        ) : null}
        {groupOnly ? null : (
          <>
            <div style={{ display: "flex", flexDirection: "row", gap: 12 }}>
              <div style={{ flexGrow: 1 }}>
                <CountrySelect value={draft.country} onChange={(v) => set({ country: v })} />
              </div>
              <div style={{ flexGrow: 1 }}>
                <EditorField
                  label="Language"
                  testId="channel-field-language"
                  value={draft.language}
                  placeholder="e.g. Portuguese"
                  onChange={(v) => set({ language: v })}
                />
              </div>
            </div>
            <EditorField
              label="Icon URL or path"
              testId="channel-field-icon"
              value={draft.icon}
              placeholder="https://…/logo.png"
              onChange={(v) => set({ icon: v })}
            />
          </>
        )}
        {error ? (
          <text style={{ fontSize: 12, fontFamily: FONT, color: C.accent }}>{error}</text>
        ) : null}
      </div>
    </div>
  );
}
