/**
 * 리더가 브라우저에서 듣는 것 가운데, 값으로 답할 수 있는 것들.
 *
 * 리스너를 걸고 떼는 일은 화면 쪽 훅이 맡으므로 여기서 재는 것은 그 훅이 무엇을
 * 키로 삼아야 하는지뿐이다. 슬라이드쇼의 기다림이 그것 하나에 달려 있다.
 */

import { Option } from 'effect'
import { describe, expect, test } from 'vite-plus/test'

import { defaultSettings } from '../types.ts'
import { init } from './model.ts'
import type { Model } from './model.ts'
import { slideshowWait } from './subscription.ts'

/** 넓은 페이지를 반씩 읽으며 도는 중인 리더. 4페이지에 서 있다. */
const playing: Model = {
  ...init({
    bookId: 'volume-1::42',
    page: 3,
    maybeResumePage: Option.none(),
    bookmarks: [],
    marks: [],
    rotation: 0,
    maybeBookSettings: Option.none(),
    settings: { ...defaultSettings, splitWide: true },
  }),
  isPlaying: true,
}

describe('what the slideshow wait is tied to', () => {
  test('moving to the other half of a page starts the wait again', () => {
    expect(slideshowWait({ ...playing, half: 'second' })).not.toStrictEqual(slideshowWait(playing))
  })

  test('turning to another page starts the wait again', () => {
    expect(slideshowWait({ ...playing, page: 4 })).not.toStrictEqual(slideshowWait(playing))
  })

  test('a reader that is not playing is not waiting for anything', () => {
    expect(slideshowWait({ ...playing, isPlaying: false })).toStrictEqual(Option.none())
  })
})
