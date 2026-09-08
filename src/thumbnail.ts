/** 이미지 URL을 책장에 쓸 작은 표지 썸네일 blob으로 만든다. */

import { Duration, Effect } from 'effect'
import { CoverError } from './errors.ts'

/** 끝내 디코딩되지 않는 페이지가 임포트를 영원히 붙잡고 있어서는 안 된다. */
const DECODE_TIMEOUT = Duration.seconds(15)

const loadImage = (url: string): Effect.Effect<HTMLImageElement, CoverError> =>
  Effect.callback<HTMLImageElement, CoverError>((resume) => {
    const img = new Image()
    img.onload = () => resume(Effect.succeed(img))
    img.onerror = () =>
      resume(Effect.fail(new CoverError({ reason: 'Could not decode the cover image' })))
    img.src = url
    // 중단되면(타임아웃이든 임포트를 그만두든) 받아오던 것도 취소한다.
    return Effect.sync(() => {
      img.src = ''
    })
  }).pipe(
    Effect.timeoutOrElse({
      duration: DECODE_TIMEOUT,
      orElse: () => new CoverError({ reason: 'Timed out decoding the cover image' }),
    }),
  )

/**
 * 이미지를 책장 크기의 WebP 표지로 줄여 그린다.
 *
 * 비율은 지키고, 원본보다 키우지는 않는다.
 *
 * @param url 표지로 쓸 페이지의 object URL.
 * @param maxSize 결과물의 긴 변, 픽셀 단위.
 */
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
