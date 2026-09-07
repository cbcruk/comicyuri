/** Render an image URL into a small cover thumbnail blob for the shelf. */

import { Duration, Effect } from 'effect'
import { CoverError } from './errors.ts'

/** A page that never decodes must not stall an import forever. */
const DECODE_TIMEOUT = Duration.seconds(15)

const loadImage = (url: string): Effect.Effect<HTMLImageElement, CoverError> =>
  Effect.callback<HTMLImageElement, CoverError>((resume) => {
    const img = new Image()
    img.onload = () => resume(Effect.succeed(img))
    img.onerror = () =>
      resume(Effect.fail(new CoverError({ reason: 'Could not decode the cover image' })))
    img.src = url
    // Interruption (timeout, or the import being abandoned) cancels the fetch.
    return Effect.sync(() => {
      img.src = ''
    })
  }).pipe(
    Effect.timeoutOrElse({
      duration: DECODE_TIMEOUT,
      orElse: () => new CoverError({ reason: 'Timed out decoding the cover image' }),
    }),
  )

export function makeCover(url: string, maxSize = 400): Effect.Effect<Blob, CoverError> {
  return Effect.gen(function* () {
    const img = yield* loadImage(url)
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return yield* new CoverError({ reason: 'Canvas 2D is unavailable' })
    ctx.drawImage(img, 0, 0, w, h)

    return yield* Effect.callback<Blob, CoverError>((resume) => {
      canvas.toBlob(
        (blob) =>
          resume(
            blob
              ? Effect.succeed(blob)
              : Effect.fail(new CoverError({ reason: 'Could not encode the cover image' })),
          ),
        'image/webp',
        0.75,
      )
    })
  })
}
