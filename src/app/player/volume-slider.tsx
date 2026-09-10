import { useCallback, useRef } from 'react'
import type { PublicInstance } from '@gpuix/react'
import type { EventPayload } from '@gpuix/native'
import { dragRouter } from '../focus'
import { ratioFromEvent, thumbLeftPx, usePaintedBounds, SCRUB_BAR_HEIGHT, SCRUB_THUMB_SIZE, SCRUB_TRACK_HEIGHT } from './seek-bar'
import { C } from '../theme'

export function VolumeSlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const trackRef = useRef<PublicInstance | null>(null)
  const { boundsRef, sample, trackWidth, attachRef } = usePaintedBounds(trackRef)
  const draggingRef = useRef(false)
  const layoutWidth = trackWidth || (boundsRef.current?.[2] ?? 0)
  const fillWidth = layoutWidth > 0 ? value * layoutWidth : 0
  const thumbLeft = thumbLeftPx(layoutWidth, value)

  const apply = useCallback(
    (event: EventPayload) => {
      const bounds = sample() ?? boundsRef.current
      const ratio = ratioFromEvent(event, bounds)
      if (ratio == null) return
      onChange(ratio)
    },
    [boundsRef, onChange, sample],
  )

  const endDrag = useCallback(
    (event: EventPayload) => {
      if (!draggingRef.current) return
      draggingRef.current = false
      dragRouter.current = null
      apply(event)
    },
    [apply],
  )

  const beginDrag = useCallback(
    (event: EventPayload) => {
      if (event.button != null && event.button !== 0) return
      draggingRef.current = true
      apply(event)
      dragRouter.current = {
        move: apply,
        end: endDrag,
      }
    },
    [apply, endDrag],
  )

  const barTop = (SCRUB_TRACK_HEIGHT - SCRUB_BAR_HEIGHT) / 2

  return (
    <div
      ref={attachRef}
      testId="volume-slider"
      onMouseDown={beginDrag}
      style={{
        width: 88,
        height: SCRUB_TRACK_HEIGHT,
        position: 'relative',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: barTop,
          height: SCRUB_BAR_HEIGHT,
          borderRadius: 2,
          backgroundColor: C.track,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: barTop,
          width: fillWidth,
          height: SCRUB_BAR_HEIGHT,
          borderRadius: 2,
          backgroundColor: C.secondary,
          pointerEvents: 'none',
        }}
      />
      {layoutWidth > 0 ? (
        <div
          style={{
            position: 'absolute',
            left: thumbLeft,
            top: (SCRUB_TRACK_HEIGHT - SCRUB_THUMB_SIZE) / 2,
            width: SCRUB_THUMB_SIZE,
            height: SCRUB_THUMB_SIZE,
            borderRadius: SCRUB_THUMB_SIZE / 2,
            backgroundColor: C.thumb,
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </div>
  )
}
