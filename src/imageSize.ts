/**
 * 이미지 바이트의 머리에서 폭과 높이를 읽는다.
 *
 * 디코딩하지 않는다. 임포트할 때 한 권의 모든 페이지를 재야 하는데, 그리지도
 * 않을 이미지를 전부 디코딩하면 임포트가 몇 배로 길어진다. 필요한 것은 두
 * 숫자뿐이고, 그 두 숫자는 어느 형식이든 파일 앞쪽 몇십 바이트에 있다.
 *
 * 읽어 내지 못한 바이트는 실패가 아니라 `None`이다. 크기를 모르는 페이지는
 * 크기를 쓰는 규칙에서 빠질 뿐이고, 책이 열리지 않을 이유는 되지 않는다.
 */

import { Option } from 'effect'

/** 이미지 한 장의 픽셀 크기. */
export interface ImageSize {
  /** 가로 픽셀. */
  readonly width: number
  /** 세로 픽셀. */
  readonly height: number
}

const size = (width: number, height: number): Option.Option<ImageSize> =>
  width > 0 && height > 0 ? Option.some({ width, height }) : Option.none()

const viewOf = (bytes: Uint8Array): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

/** 주어진 자리에서 시작하는 바이트가 이 ASCII 문자열인지. */
const matches = (bytes: Uint8Array, at: number, ascii: string): boolean => {
  if (at + ascii.length > bytes.length) return false
  for (let i = 0; i < ascii.length; i++) {
    if (bytes[at + i] !== ascii.charCodeAt(i)) return false
  }
  return true
}

const startsWith = (bytes: Uint8Array, ...signature: number[]): boolean =>
  signature.length <= bytes.length && signature.every((byte, i) => bytes[i] === byte)

// PNG: 시그니처 8바이트 다음이 곧 IHDR이고, 폭과 높이가 그 앞머리에 있다.
const pngSize = (bytes: Uint8Array): Option.Option<ImageSize> => {
  if (bytes.length < 24 || !matches(bytes, 12, 'IHDR')) return Option.none()
  const view = viewOf(bytes)
  return size(view.getUint32(16), view.getUint32(20))
}

// GIF: 논리 화면 기술자가 시그니처 바로 뒤에 붙는다.
const gifSize = (bytes: Uint8Array): Option.Option<ImageSize> => {
  if (bytes.length < 10) return Option.none()
  const view = viewOf(bytes)
  return size(view.getUint16(6, true), view.getUint16(8, true))
}

// BMP: 아래에서 위로 그리는 그림은 높이가 음수라서 절댓값을 쓴다.
const bmpSize = (bytes: Uint8Array): Option.Option<ImageSize> => {
  if (bytes.length < 26) return Option.none()
  const view = viewOf(bytes)
  return size(Math.abs(view.getInt32(18, true)), Math.abs(view.getInt32(22, true)))
}

/**
 * WebP는 한 형식이 아니라 RIFF 컨테이너에 담긴 세 가지다. 손실(`VP8 `),
 * 무손실(`VP8L`), 그리고 확장(`VP8X`)이 각각 다른 자리에 크기를 적는다.
 */
const webpSize = (bytes: Uint8Array): Option.Option<ImageSize> => {
  if (bytes.length < 30) return Option.none()
  const view = viewOf(bytes)

  if (matches(bytes, 12, 'VP8X')) {
    const width = view.getUint16(24, true) + (bytes[26] << 16) + 1
    const height = view.getUint16(27, true) + (bytes[29] << 16) + 1
    return size(width, height)
  }

  if (matches(bytes, 12, 'VP8L')) {
    // 14비트씩 이어 붙인 값이라 바이트 경계에 맞지 않는다.
    const bits = view.getUint32(21, true)
    return size((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
  }

  if (matches(bytes, 12, 'VP8 ')) {
    // 위쪽 두 비트는 배율이라 떼어 낸다.
    return size(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff)
  }

  return Option.none()
}

/**
 * EXIF의 회전 값. 5~8은 눕힌 사진이라 브라우저가 세워서 그리고, 그러면 화면에
 * 나오는 폭과 높이가 헤더에 적힌 것과 뒤바뀐다.
 */
const isTurned = (orientation: number): boolean => orientation >= 5 && orientation <= 8

/** APP1 세그먼트에서 회전 값을 찾는다. EXIF가 아니거나 회전 태그가 없으면 1. */
const exifOrientation = (bytes: Uint8Array, at: number, length: number): number => {
  if (!matches(bytes, at, 'Exif\0\0')) return 1

  const tiff = at + 6
  if (tiff + 8 > bytes.length) return 1

  const view = viewOf(bytes)
  const little = view.getUint16(tiff, true) === 0x4949
  const ifd = tiff + view.getUint32(tiff + 4, little)
  if (ifd + 2 > Math.min(bytes.length, at + length)) return 1

  const count = view.getUint16(ifd, little)
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12
    if (entry + 12 > bytes.length) break
    if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little)
  }
  return 1
}

/**
 * JPEG는 크기를 파일 앞이 아니라 프레임 헤더에 적으므로 세그먼트를 따라간다.
 * `SOF` 계열이 그 헤더인데, 같은 대역의 `DHT`·`DAC`·`JPG`는 프레임이 아니다.
 */
const isFrameHeader = (marker: number): boolean =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc

const jpegSize = (bytes: Uint8Array): Option.Option<ImageSize> => {
  const view = viewOf(bytes)
  let orientation = 1
  let at = 2

  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return Option.none()

    const marker = bytes[at + 1]
    // 채움 바이트는 마커가 아니라 정렬용이다.
    if (marker === 0xff) {
      at += 1
      continue
    }
    // 길이 없이 홀로 서는 마커들.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      at += 2
      continue
    }

    const length = view.getUint16(at + 2)
    if (length < 2) return Option.none()

    if (marker === 0xe1) {
      orientation = exifOrientation(bytes, at + 4, length - 2)
    }

    if (isFrameHeader(marker)) {
      if (at + 9 > bytes.length) return Option.none()
      const height = view.getUint16(at + 5)
      const width = view.getUint16(at + 7)
      return isTurned(orientation) ? size(height, width) : size(width, height)
    }

    at += 2 + length
  }

  return Option.none()
}

/**
 * AVIF와 HEIF는 ISOBMFF 상자 안에 크기를 넣는다. 상자 나무를 온전히 걷는 대신
 * 머리에서 첫 `ispe`를 찾는다. 그 형식들은 `meta` 상자를 픽셀 앞에 두고, 거기
 * 처음 나오는 `ispe`가 표시할 이미지의 것이다.
 */
const ISPE_SEARCH_LIMIT = 4096

const isobmffSize = (bytes: Uint8Array): Option.Option<ImageSize> => {
  const limit = Math.min(bytes.length - 12, ISPE_SEARCH_LIMIT)
  const view = viewOf(bytes)

  for (let at = 0; at <= limit; at++) {
    if (matches(bytes, at, 'ispe')) {
      // 상자 이름 다음의 4바이트는 버전과 플래그다.
      return size(view.getUint32(at + 8), view.getUint32(at + 12))
    }
  }
  return Option.none()
}

/**
 * 이미지 바이트에서 픽셀 크기를 읽는다. PNG, JPEG, GIF, WebP, BMP,
 * AVIF/HEIF를 알아본다.
 *
 * JPEG는 EXIF 회전을 반영한다. 브라우저가 눕힌 사진을 세워서 그리므로, 화면에
 * 나오는 모양과 여기서 답하는 크기가 어긋나지 않아야 한다.
 *
 * @param bytes 이미지 파일 전체, 또는 최소한 그 머리.
 * @returns 읽어 낸 크기. 형식을 모르거나 헤더가 잘렸으면 `None`.
 */
export const imageSize = (bytes: Uint8Array): Option.Option<ImageSize> => {
  if (bytes.length < 16) return Option.none()

  if (startsWith(bytes, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return pngSize(bytes)
  if (startsWith(bytes, 0xff, 0xd8, 0xff)) return jpegSize(bytes)
  if (matches(bytes, 0, 'GIF8')) return gifSize(bytes)
  if (matches(bytes, 0, 'RIFF') && matches(bytes, 8, 'WEBP')) return webpSize(bytes)
  if (matches(bytes, 0, 'BM')) return bmpSize(bytes)
  if (matches(bytes, 4, 'ftyp')) return isobmffSize(bytes)

  return Option.none()
}
