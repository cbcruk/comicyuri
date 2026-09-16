/**
 * 리더 atom이 update를 그대로 싣고 도는지. Model은 atom에 남고, 나머지는 부른 쪽으로
 * 돌아온다.
 */

import { Option } from 'effect'
import { AtomRegistry } from 'effect/unstable/reactivity'
import { describe, expect, test } from 'vite-plus/test'

import { defaultSettings } from '../types.ts'
import { dispatch, makeReaderAtom } from './atom.ts'
import { Message } from './message.ts'
import { init } from './model.ts'

const opened = () =>
  init({
    bookId: 'volume-1::42',
    page: 0,
    maybeResumePage: Option.none(),
    bookmarks: [],
    marks: [],
    rotation: 0,
    maybeBookSettings: Option.none(),
    settings: defaultSettings,
  })

describe('the reader atom', () => {
  test('a dispatched Message folds into the atom and hands back what is left', () => {
    const registry = AtomRegistry.make()
    const atom = makeReaderAtom(opened())

    const first = dispatch(registry, atom, Message.ClickedToggleFullscreen())
    expect(first.commands).toStrictEqual([{ _tag: 'ToggleFullscreen', wantFullscreen: true }])
    expect(first.maybeOutMessage).toStrictEqual(Option.none())

    dispatch(registry, atom, Message.ChangedFullscreen({ isFullscreen: true }))
    expect(registry.get(atom).isFullscreen).toBe(true)

    const exited = dispatch(registry, atom, Message.ClickedExit())
    expect(exited.maybeOutMessage).toStrictEqual(Option.some({ _tag: 'RequestedExit' }))
  })
})
