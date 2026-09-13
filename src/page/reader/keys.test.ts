/**
 * 키 하나가 어떤 Message로 풀리는지. 단축키는 같은 일을 하는 버튼이 보내는
 * Message로 풀리므로, 키와 버튼이 서로 어긋날 수 없다.
 *
 * 넘김 키와 Escape는 Model을 보고 갈리므로 각자의 자리에서 덮는다(`R-2A1`,
 * `R-2A3`). 여기서 재는 것은 Model과 무관하게 한 가지로 풀리는 토글들이다.
 */

import { Option } from 'effect'
import { describe, expect, test } from 'vite-plus/test'

import { defaultSettings } from '../../types.ts'
import { isReaderKey, messageForKey } from './keys.ts'
import { init } from './model.ts'

const model = init({
  bookId: 'volume-1::42',
  page: 0,
  maybeResumePage: Option.none(),
  bookmarks: [],
  marks: [],
  rotation: 0,
  maybeBookSettings: Option.none(),
  settings: defaultSettings,
})

/** 그 키가 뜻하는 Message의 이름. 아무것도 뜻하지 않으면 없음이다. */
const tagFor = (key: string): string | null =>
  Option.getOrNull(Option.map(messageForKey(model, key, false), (message) => message._tag))

const NOTHING_PRESSED: Readonly<{ ctrl: boolean; meta: boolean; alt: boolean }> = {
  ctrl: false,
  meta: false,
  alt: false,
}

describe('the keys that toggle something', () => {
  /** `R-2A2`의 표를 그대로 옮긴 것. 여기가 그 표의 근거다. */
  const TOGGLES: ReadonlyArray<readonly [string, string]> = [
    ['d', 'ClickedToggleDirection'],
    ['v', 'ClickedToggleView'],
    ['s', 'ClickedToggleBinding'],
    ['r', 'ClickedRotate'],
    ['p', 'ClickedToggleSlideshow'],
    ['t', 'ClickedToggleThumbs'],
    [',', 'ClickedToggleSettings'],
    ['b', 'ClickedToggleBookmark'],
    ['f', 'ClickedToggleFullscreen'],
    ['+', 'ClickedZoomIn'],
    ['-', 'ClickedZoomOut'],
  ]

  for (const [key, tag] of TOGGLES) {
    test(`"${key}" is the same thing the ${tag} control does`, () => {
      expect(tagFor(key)).toBe(tag)
    })
  }

  test('Home and End are the ends of the book, whichever way it reads', () => {
    expect(tagFor('Home')).toBe('ClickedFirst')
    expect(tagFor('End')).toBe('ClickedLast')
  })

  test('the bracket keys are the bookmarks either side', () => {
    expect(tagFor(']')).toBe('ClickedStepBookmark')
    expect(tagFor('[')).toBe('ClickedStepBookmark')
  })
})

describe('the keys the reader leaves alone', () => {
  test('a letter it has no use for goes to the browser', () => {
    for (const key of ['a', 'z', '/', 'F5']) {
      expect(isReaderKey(key, NOTHING_PRESSED)).toBe(false)
      expect(messageForKey(model, key, false)).toStrictEqual(Option.none())
    }
  })

  // 브라우저의 단축키를 빼앗지 않는다. `Ctrl+D`는 북마크를 켜는 것이 아니다.
  test('a key held with a modifier is the browser’s, not the reader’s', () => {
    for (const held of [
      { ...NOTHING_PRESSED, ctrl: true },
      { ...NOTHING_PRESSED, meta: true },
      { ...NOTHING_PRESSED, alt: true },
    ]) {
      expect(isReaderKey('d', held)).toBe(false)
      expect(isReaderKey('ArrowLeft', held)).toBe(false)
    }
  })

  test('Shift is the one it keeps for itself', () => {
    expect(isReaderKey('ArrowLeft', NOTHING_PRESSED)).toBe(true)
  })
})
