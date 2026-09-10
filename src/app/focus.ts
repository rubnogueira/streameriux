import type { EventPayload } from '@gpuix/native'

export const keyRouter: { current: ((event: { key?: string; code?: string }) => void) | null } = {
  current: null,
}

export const playerFocusedRef = { current: true }

let textInputFocusDepth = 0

export function textInputFocusProps() {
  return {
    onFocus: () => {
      textInputFocusDepth += 1
    },
    onBlur: () => {
      textInputFocusDepth = Math.max(0, textInputFocusDepth - 1)
    },
  }
}

export function textInputIsFocused(): boolean {
  return textInputFocusDepth > 0
}

export type DragSession = {
  move: (event: EventPayload) => void
  end: (event: EventPayload) => void
}

/** Routes pointer moves while a slider drag is active (survives leaving the thin track). */
export const dragRouter: { current: DragSession | null } = { current: null }
