/**
 * 메뉴 항목 옆에 적히는 단축키.
 *
 * 값은 `src/page/reader/keys.ts`의 `COMMAND_KEYS`와 같은 것을 가리킨다. 키를
 * 실제로 푸는 자리는 거기 하나뿐이고 여기는 그것을 사람이 읽는 글자로 적을
 * 뿐이므로, 키가 바뀌면 두 곳을 같이 고친다.
 *
 * 넘김 키는 읽는 방향을 따라 갈리지만(`←`가 앞일 수도 뒤일 수도 있다) 메뉴에는
 * 방향을 타지 않는 쪽을 적는다 — `PageUp`/`PageDown`은 언제나 뒤와 앞이다.
 */
export const SHORTCUTS = {
  exit: 'Esc',
  bookmark: 'b',
  thumbs: 't',
  direction: 'd',
  view: 'v',
  binding: 's',
  rotate: 'r',
  zoomIn: '+',
  zoomOut: '-',
  fullscreen: 'f',
  chrome: 'h',
  first: 'Home',
  previous: 'PageUp',
  next: 'PageDown',
  last: 'End',
  nextBookmark: ']',
  previousBookmark: '[',
  slideshow: 'p',
  settings: ',',
} as const

/** {@linkcode SHORTCUTS}가 아는 이름. */
export type ShortcutName = keyof typeof SHORTCUTS
