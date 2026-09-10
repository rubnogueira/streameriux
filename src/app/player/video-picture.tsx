import { memo, useRef } from 'react'
import { useExternalSnapshot } from '../../lib/react-sync'
import type { VideoFit } from '../../media/native-video'
import type { StreamPlayer } from '../../player'

export const PICTURE_LAYER = {
  position: 'absolute',
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  width: '100%',
  height: '100%',
  // Let clicks fall through to the stage (play/pause on click).
  pointerEvents: 'none',
} as const

/**
 * Blits decoded frames through GPUI's `<img>`. Each frame is a distinct `src`, so
 * a single `<img>` re-decodes on every swap and paints its (empty) background in
 * the gap — that gap is the black flicker. Instead we keep two stacked layers
 * and only ever repoint the *back* one, promoting it to the front. The layer
 * that is not updating keeps showing its already-decoded frame, so there is
 * always a picture on screen while the new one loads underneath the paint.
 *
 * Frames arrive as inline `data:image/bmp;base64,…` URLs (see `frame.ts`): gpui
 * holds each such image on the `<img>` element itself and frees it when the src
 * changes or the element unmounts, so nothing accumulates. A file-path src would
 * instead be retained forever in gpui's path-keyed image cache — one leaked
 * bitmap per frame. Remounting the back `<img>` (via aGen/bGen) drops its prior
 * frame as the new one takes its place.
 */
type FrameLayers = {
  a: string | null
  b: string | null
  aGen: number
  bGen: number
  front: 'a' | 'b'
}
const EMPTY_FRAME_LAYERS: FrameLayers = { a: null, b: null, aGen: 0, bGen: 0, front: 'a' }

export function usePlayerFrameLayers(player: StreamPlayer | null): FrameLayers {
  const storeRef = useRef({
    snapshot: EMPTY_FRAME_LAYERS,
    push(path: string | null) {
      if (!path) {
        this.snapshot = EMPTY_FRAME_LAYERS
        return
      }
      const back = this.snapshot.front === 'a' ? 'b' : 'a'
      const genKey = back === 'a' ? 'aGen' : 'bGen'
      this.snapshot = {
        ...this.snapshot,
        [back]: path,
        [genKey]: this.snapshot[genKey] + 1,
        front: back,
      }
    },
  })

  return useExternalSnapshot(
    (onStoreChange) => {
      if (!player) {
        storeRef.current.snapshot = EMPTY_FRAME_LAYERS
        return () => {}
      }
      return player.subscribeFrame((path) => {
        storeRef.current.push(path)
        onStoreChange()
      })
    },
    () => storeRef.current.snapshot,
    () => EMPTY_FRAME_LAYERS,
  )
}

export const VideoPicture = memo(function VideoPicture({
  player,
  objectFit,
}: {
  player: StreamPlayer | null
  objectFit: VideoFit
}) {
  const layers = usePlayerFrameLayers(player)

  if (!layers.a && !layers.b) return null

  // Stable keys: each layer is one reused <img> whose src is repointed, never a
  // fresh element per frame. A data: URL frees its decoded image when the src
  // changes, so the old cache-busting remount (aGen/bGen) is unnecessary and
  // only churned elements through the renderer.
  const imgA = layers.a ? (
    <img key="a" src={layers.a} objectFit={objectFit} style={PICTURE_LAYER} />
  ) : null
  const imgB = layers.b ? (
    <img key="b" src={layers.b} objectFit={objectFit} style={PICTURE_LAYER} />
  ) : null

  // Paint the front layer last so it sits on top; the back layer holds the
  // previous frame and shows through until the front finishes decoding.
  return layers.front === 'a' ? (
    <>
      {imgB}
      {imgA}
    </>
  ) : (
    <>
      {imgA}
      {imgB}
    </>
  )
})
