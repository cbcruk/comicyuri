import { Option, Record } from 'effect'

import { Message } from './message.ts'
import type { Model } from './model.ts'

/**
 * Keys the reader consumes, in one place, because two things need the same
 * answer: `update` needs the Message a key means, and the subscription needs
 * to know whether to take the key away from the browser. Splitting those apart
 * is how a reader ends up swallowing Ctrl+R.
 */
const TURN_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ' ']

const COMMAND_KEYS: Readonly<Record<string, () => Message>> = {
  Home: Message.ClickedFirst,
  End: Message.ClickedLast,
  d: Message.ClickedToggleDirection,
  v: Message.ClickedToggleView,
  f: Message.ClickedToggleFullscreen,
  t: Message.ClickedToggleThumbs,
  b: Message.ClickedToggleBookmark,
  '+': Message.ClickedZoomIn,
  '-': Message.ClickedZoomOut,
}

export type Modifiers = Readonly<{
  ctrl: boolean
  meta: boolean
  alt: boolean
}>

/**
 * Whether this keystroke belongs to the reader at all. A key held with a
 * modifier belongs to the browser — Ctrl+R reloads, Cmd+F searches — and the
 * reader never takes those.
 */
export const isReaderKey = (key: string, modifiers: Modifiers): boolean => {
  if (modifiers.ctrl || modifiers.meta || modifiers.alt) return false
  return key === 'Escape' || TURN_KEYS.includes(key) || Record.has(COMMAND_KEYS, key)
}

/**
 * The Message a key means, resolved against the Model. Shortcuts resolve to
 * the Message the equivalent control sends, so a key and a button cannot
 * drift apart.
 *
 * The turn keys follow the visual direction: in right-to-left reading the left
 * key advances, which is what makes manga feel right.
 */
export const messageForKey = (model: Model, key: string): Option.Option<Message> => {
  // Escape peels one layer at a time rather than always leaving the book.
  if (key === 'Escape') {
    if (model.isThumbsOpen) return Option.some(Message.ClickedToggleThumbs())
    if (model.isFullscreen) return Option.some(Message.ClickedToggleFullscreen())
    return Option.some(Message.ClickedExit())
  }

  const rtl = model.settings.direction === 'rtl'
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
  const back = rtl ? 'ArrowRight' : 'ArrowLeft'

  if (key === forward || key === 'ArrowDown' || key === 'PageDown' || key === ' ') {
    return Option.some(Message.ClickedNext())
  }
  if (key === back || key === 'ArrowUp' || key === 'PageUp') {
    return Option.some(Message.ClickedPrevious())
  }

  return Option.map(Record.get(COMMAND_KEYS, key), (toMessage) => toMessage())
}
