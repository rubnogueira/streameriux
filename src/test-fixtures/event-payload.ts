import type { EventPayload } from "@gpuix/native";

export function eventPayload(overrides: Partial<EventPayload> = {}): EventPayload {
  return { elementId: 0, eventType: "pointer", ...overrides };
}
