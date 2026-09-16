# 리더 상태 계층 이관 검토 (`src/page/reader/` → `src/reader/`)

검토 대상: 브랜치 `migrate/react-atom`의 추적되지 않은 `src/reader/**`.
기준: `MIGRATION.md`(기계적 이관, 동작 불변, 테스트가 정답지)와 `SPEC.md`의 `R-2xx`.

검증에 쓴 것: `vp test`(23파일 500개 통과), `vp check`(통과), 그리고 옛 `update`와 새
`update`를 같은 파일에서 나란히 돌린 임시 테스트 7개(모두 통과, 검토 후 삭제).
아래에서 "증명됨"은 그 임시 테스트가 두 쪽의 차이를 실제로 찍어 냈다는 뜻이다.

먼저 전제 하나. **`src/reader/**`는 아직 React 앱 어디에서도 불리지 않는다.**

```
$ grep -rn "reader/atom\|reader/update\|reader/model\|reader/subscription" src \
    | grep -v "^src/reader/" | grep -v "^src/page/reader/"
(없음)
```

`src/app/reader.tsx`는 `useState(0)`으로 페이지를 쥐고 `defaultSettings`와 `marks: []`를
쓰는 별도의 시제품이다. 그래서 이관 주석이 "이제 화면이 맡는다"고 말하는 규칙 가운데
여럿은 **아직 존재하지 않는 코드에 대한 주장**이다. 아래 판정은 그 점을 전제로 한다.

---

## 1. `R-207` 굴림 규칙이 실효를 잃었다 — 증명됨 · 치명

### 옛 코드

```ts
// src/page/reader/update.ts:401
ScrolledStage: ({ delta, room: measured, device }) => {
  const room = holdsEarlierSpread(model) ? NO_ROOM : measured
  const pan = pannedBy(model.pan, delta, room)
```

`holdsEarlierSpread`는 Model 안에서 스스로 답했다. 화면에 걸린 것이 Model의
`page`·`zoom`·`pan`과 다르면 참이다.

### 새 코드

```ts
// src/reader/update.ts:386
ScrolledStage: ({ delta, room, device }): UpdateReturn => {
  const pan = pannedBy(model.pan, delta, room)
```

판단을 호출자에게 넘겼다. `src/reader/message.ts:68`과 `update.ts:384`가 모두
"넘긴 페이지가 아직 서지 않았으면 화면이 `NO_ROOM`을 실어 보낸다"고 적는다.

### 그런 화면이 없다

`room`을 만드는 유일한 자리는 `src/reader/subscription.ts:86`의 `roomOnStage()`인데,

- `roomOnStage()`는 언제나 `getBoundingClientRect`로 잰 값을 돌려준다. 스프레드가
  도착했는지를 받을 **인자가 없다**.
- `roomOnStage`와 `messageForWheel`을 부르는 곳이 저장소 전체에 **하나도 없다**
  (`grep -rn "roomOnStage\|messageForWheel" src` → 정의부뿐).

즉 지금 이 코드로 리더를 세우면 `R-207`의 굴림 부분은 켜지지 않는다. 지워진 테스트
`a scroll before it arrives does not move the page on its way`가 지키던 바로 그 동작이다.

### 증명

옛 update와 새 update에 같은 이야기를 먹였다.

|                                                | `scrolled.pan`                     |
| ---------------------------------------------- | ---------------------------------- |
| 옛 `update` (`holdsEarlierSpread` → `NO_ROOM`) | `ORIGIN`                           |
| 새 `update` (재어 온 `room`을 그대로 씀)       | `ORIGIN`이 아님, `zoom`은 이미 `1` |

확대가 풀린 다음 페이지가 확대해 둔 이전 페이지의 거리로 움직인다 — `SPEC.md:414`가
이 테스트를 근거로 적어 둔 바로 그 사고다.

### 고치는 값

둘 중 하나다. (ㄱ) `roomOnStage(isSpreadReady: boolean)`처럼 인자를 받게 하고 스테이지
훅이 스프레드 atom의 `AsyncResult.isSuccess`를 넘긴다 — 작다. (ㄴ) Model이 "화면에
걸린 스프레드"를 다시 알게 한다(§2와 함께 풀린다). 어느 쪽이든 story 테스트를
되살릴 수 있어야 한다. (ㄱ)이면 테스트는 `room: NO_ROOM`을 손으로 실어 보내는 꼴이 되어
규칙을 재지 못하므로, 근거는 스테이지 훅의 화면 테스트로 옮겨야 한다.

---

## 2. `R-207`의 "남아 있는 페이지를 그것이 그리던 값으로 그린다"가 어디에도 없다 — 치명

### 옛 코드

```ts
// src/page/reader/model.ts:71
export const OnScreen = Schema.Struct({
  page,
  panels,
  entry,
  half,
  zoom,
  pan,
})
```

주석이 이유를 적어 두었다. "넘기는 순간 Model의 이 값들은 이미 다음 페이지의 것이라,
그것으로 이전 페이지를 그리면 끝에 붙거나 반쪽이 바뀌거나 확대가 풀려 한 번 튄다."

### 새 코드

`OnScreen`도 `SpreadState`도 없다. 대신 `src/app/reader.tsx:30`이

```ts
type Shown = Readonly<{ pages: ReadonlyArray<number>; panels: ReadonlyArray<SpreadPanel> }>
```

**`entry`·`half`·`zoom`·`pan`이 없다.** 새 Model에도 이전 값의 사본이 없다. 그러니
남아 있는 페이지를 그것이 그리던 배율·이동·들어선 쪽으로 그릴 수 있는 정보가
저장소 어디에도 남아 있지 않다.

지워진 테스트 둘(`it keeps what it drew with, not what the next page will use`,
`a zoomed page stays zoomed until the next one can be drawn`)과 `SPEC.md:412-424`가
근거로 거는 scene 테스트 `a zoomed page keeps its zoom while the next one is on its way`,
e2e `R-207 · 확대해 둔 페이지는 다음 페이지가 설 때까지 확대된 채 남는다`가 전부 이것이다.

### 증명

타입 수준에서 증명된다 — `Shown`에도 `Model`에도 그 필드가 없으므로 그릴 값을 꺼낼
길이 없다. 실행으로 반증할 코드 자체가 없다.

### 고치는 값

`Shown`을 `{ pages, panels, entry, half, zoom, pan }`으로 넓히고, 스프레드가 성공할 때
Model에서 그 넷을 같이 찍어 두면 된다(지금 `useEffect`가 `panels`를 찍는 그 자리다).
작업은 작지만, **이 판단은 리더 화면을 짜기 전에 내려야 한다.** 나중에 붙이면
`R-207`을 위해 화면 상태를 다시 설계하게 된다.

---

## 3. 지워진 8개 테스트 판정표

`(a)` 다른 곳이 맡고 테스트도 있다 · `(b)` 다른 곳이 맡지만 테스트가 없다 · `(c)` 잃었다.

| 지워진 테스트                                                            | 규칙    | 판정    | 근거                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------ | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `a spread that arrives after the reader moved on is discarded`           | `R-214` | **(a)** | `src/atoms/pages.test.ts:224` `land on their own spread and leave the one on screen alone`. atom의 답은 자기 atom에만 들어가므로 구조적으로도 덮일 수 없다.                                                                                                                                                                    |
| `a page turn does not release pages the grid is showing`                 | `R-274` | **(b)** | `src/app/thumbs/thumbs.tsx`의 각 칸이 `pageAtoms.pageUrl`을 직접 걸므로 칸이 서 있는 동안 URL이 산다. 그러나 `thumbs.screen.test.tsx`의 9개 가운데 URL 수명을 재는 것은 없고, `pages.test.ts`의 `a page still on screen keeps its URL when a neighbour sharing it lets go`는 스프레드 둘 사이의 이야기지 격자 이야기가 아니다. |
| `the page on screen stays until the next one can be drawn`               | `R-207` | **(b)** | `src/app/reader.tsx:50-58`의 `shown`이 맡는다. `reader.screen.test.tsx`가 없어 테스트는 하나도 없다.                                                                                                                                                                                                                           |
| `it keeps what it drew with, not what the next page will use`            | `R-207` | **(c)** | §2. `entry`·`half`를 쥔 곳이 없다.                                                                                                                                                                                                                                                                                             |
| `a zoomed page stays zoomed until the next one can be drawn`             | `R-207` | **(c)** | §2. `zoom`·`pan`을 쥔 곳이 없다.                                                                                                                                                                                                                                                                                               |
| `a scroll before it arrives does not move the page on its way`           | `R-207` | **(c)** | §1. 증명됨.                                                                                                                                                                                                                                                                                                                    |
| `turning again before it arrives keeps the page that is still on screen` | `R-207` | **(b)** | `shown`이 성공했을 때만 바뀌므로 두 번 넘겨도 첫 페이지가 남는다. 테스트 없음.                                                                                                                                                                                                                                                 |
| `a jump holds on to the page on screen instead of releasing it`          | `R-207` | **(b)** | `reader.tsx:101`의 `<Hold pages={shown.pages} />`가 쥔다. 테스트 없음.                                                                                                                                                                                                                                                         |

여기에 하나 더 있다. 목록에 없었지만 **`reader/subscription "moving to the other half of a
page starts the wait again"`(`SPEC.md:1068`)도 이관되지 않았다** — §4를 보라.

`(b)` 다섯 가운데 넷이 `R-207` 하나에 걸려 있고, 그 넷 모두 `src/app/reader.tsx`라는
시제품 한 파일에 걸려 있다. 리더 화면을 제대로 세울 때 이 파일은 다시 쓰이므로,
지금 상태의 `(b)`는 "다른 곳이 맡는다"보다 "아직 아무도 지키지 않는다"에 가깝다.

---

## 4. 슬라이드쇼 대기의 의존성에서 `page`와 `half`가 빠졌다 — 증명됨 · 중대

### 옛 코드

```ts
// src/page/reader/subscription.ts (slideshow entry)
modelToDependencies: (model) => ({
  isPlaying: model.isPlaying,
  page: model.page,
  half: model.half,
  seconds: model.settings.slideSeconds,
}),
```

주석이 이유를 적는다. "넘어간 순간부터 다시 세고, 사람이 손으로 넘긴 뒤에도 처음부터
센다 — 넘어가자마자 또 넘어가는 일이 없다."

### 새 코드

```ts
// src/reader/subscription.ts:196
export const slideshowSeconds = (model: Model): Option.Option<number> =>
  model.isPlaying ? Option.some(model.settings.slideSeconds) : Option.none()
```

주석은 같은 문단을 그대로 옮겨 왔지만 **값이 그것을 말하지 않는다.** `page`와 `half`가
돌아오는 값에서 사라졌으므로, 이 함수를 의존성으로 삼는 훅은 페이지가 넘어가도 타이머를
다시 걸지 않는다.

### 증명

|                                                  | 결과                         |
| ------------------------------------------------ | ---------------------------- |
| 옛 `modelToDependencies`, `half`만 다른 두 Model | 서로 다름 (타이머 재시작)    |
| 새 `slideshowSeconds`, `half`만 다른 두 Model    | `Option.some(5)` 로 **같음** |
| 새 `slideshowSeconds`, `page`만 다른 두 Model    | `Option.some(5)` 로 **같음** |

### 고치는 값

작다. `slideshowSeconds`를 대기의 **키**를 돌려주게 바꾸거나
(`Option<{ seconds, page, half }>`), 훅을 쓰는 쪽이 `[seconds, page, half]`를 의존성
배열에 넣는다는 것을 이름과 JSDoc으로 강제한다. 다만 지금 모양대로 훅을 짜면 `R-2C1`이
조용히 깨지므로, **훅을 짜기 전에** 고쳐야 한다.

---

## 5. 테스트 이름은 남고 재는 것이 사라졌다 — 중대

`MIGRATION.md` 원칙 2는 "테스트를 고쳐서 통과시키지 않는다"이고, `CLAUDE.md`는 "동작이
바뀌면 `SPEC.md`의 해당 항목과 근거로 적힌 테스트 이름을 같이 고친다"이다. 한 곳이
둘 다 어겼다.

### `opening the grid asks only for the thumbnails it can show` (`SPEC.md:803`, `R-272`)

옛 테스트는 `fillThumbs`가 고른 페이지를 `LoadThumbs` Command로 재었다. 새 테스트는

```ts
Command.resolve('MeasureThumbsWidth', Message.MeasuredThumbsWidth({ width: 1280 })),
message(Message.CompletedLoadThumbs({ panels: [{ page: 0, url: 'blob:t0' }] })),
model((model) => {
  expect(model.thumbPanels).toStrictEqual([{ page: 0, url: 'blob:t0' }])
}),
```

**무엇을 요청할지 고르는 코드가 삭제되었으므로**(`fillThumbs`, `LoadThumbs`) 이 테스트는
"건네준 것이 그대로 들어갔다"만 잰다. 증명: 같은 update에 `panels: [{ page: 999, url:
'blob:nonsense' }]`를 먹여도 그대로 들어가고 Command는 나오지 않는다. 이름이 주장하는
"only ... it can show"를 재는 것이 하나도 없다.

`R-272` 자체는 `src/app/thumbs/thumbs.screen.test.tsx`의 `a long book stands only the rows
around the window, not all of it`와 `src/page/reader/thumbs.test.ts`가 지키고 있다. 그러니
잃은 것은 규칙이 아니라 **근거의 정직성**이다. 이 story 테스트는 이름을 바꾸거나 지우고
`SPEC.md:803`의 근거 목록을 고쳐야 한다.

### 나머지

옛 테스트가 `LoadSpread({ page, pages })`로 재던 "무엇이 한 화면인가"는 새 테스트에서
`spreadPages(model)`로 제대로 옮겨졌다(21곳). 이쪽은 문제 없다.

---

## 6. 리더 Model이 죽은 배선을 지고 있다 — 중간

`src/reader/model.ts`는 `@foldkit/ui`의 `Slider.Model`과 `VirtualList.Model`,
그리고 `thumbsWidth`·`thumbPanels`를 그대로 들고 있다. 그런데 React 쪽에는 이미 각자의
주인이 서 있다.

| Model이 쥔 것                                                                                                                                     | 실제 주인                                                                                        | 겹침 |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---- |
| `slider: Slider.Model`, `GotSliderMessage`, `foldSlider`                                                                                          | `src/app/chrome/slider.tsx` (손으로 짠 `PageSlider`, `onSlide(page)`)                            | 완전 |
| `thumbs: VirtualList.Model`, `thumbsWidth`, `thumbPanels`, `GotThumbsMessage`, `MeasuredThumbsWidth`, `CompletedLoadThumbs`, `MeasureThumbsWidth` | `src/app/thumbs/thumbs.tsx` (`@tanstack/react-virtual` + `ResizeObserver` + `pageAtoms.pageUrl`) | 완전 |

`MIGRATION.md`의 표는 `@foldkit/ui → @astryxdesign/core`, `VirtualList → @tanstack/
react-virtual`이라고 적어 두었다. 지금은 두 벌이 나란히 살아 있고, 둘 중 어느 쪽도
다른 쪽을 보지 않는다. story 테스트 다섯 개가 이 죽은 절반을 재고 있어 통과하지만,
그 통과가 화면에 대해 말해 주는 것은 없다.

곁들여, 옛 `subscription.ts`가 lift 하던 자식 구독
(`Slider.subscriptions.dragPointer`/`dragEscape`, `VirtualList.subscriptions.containerEvents`)은
새 `subscription.ts`에서 **대체 없이 사라졌다.** 그래서 Model에 남은 `Slider.Model`은
끌어도 움직이지 않는 상태다.

### 더 아픈 것: 슬라이더로 페이지를 옮길 Message가 없다

`chrome/slider.tsx`의 `onSlide(page: number)`를 리더에 잇는 길은 `GotSliderMessage`뿐인데,
그러려면 `@foldkit/ui`의 `Slider.Message`를 손으로 지어 `dragState`가 `Dragging`이 되도록
맞춰야 `ChangedValue`가 나온다. Message 유니온에 "슬라이더가 N페이지에 섰다"가 없다.
`SelectedThumb`와 `SubmittedGoToPage`가 각자의 이유로 있는데 슬라이더만 없다.

### 고치는 값

중간. `GotSliderMessage`를 `SlidToPage: { page: number }` 같은 것으로 갈고(그러면
`sliderPage`의 방향 뒤집기는 이미 `slider.tsx`가 하고 있으니 `update`에서 빼거나
그대로 두고), 썸네일 필드 일곱을 Model에서 들어낸다. story 테스트 다섯은 그때 같이
지우고 `SPEC.md`의 근거를 화면 테스트로 옮긴다. `MIGRATION.md` 원칙 3("줄일 것은
나중에")을 들어 미뤄 둘 수도 있지만, **리더 화면을 붙이기 전에는 정리해야 한다** —
그러지 않으면 슬라이더와 격자가 두 개의 진실을 갖는다.

---

## 7. 자식 fold 두 개의 계약 차이 — 낮음 (하나는 증명됨, 하나는 잠재)

`Update.foldChild`의 계약은 `node_modules/foldkit/dist/update/update.js:148`이다.
자식의 Command를 `toParentMessage`로 들어올려 부모의 batch 앞에 놓고, 그다음
`foldOutMessage`의 Command를 잇는다.

### `foldSlider` — 자식 Command를 버린다 (잠재)

```ts
// src/reader/update.ts:127
const folded = Slider.update(model.slider, message)
const next = evo(model, { slider: () => folded.model })
return folded.outMessage === undefined ? { model: next } : goToPage(next, ...)
```

`folded.commands`를 읽지 않는다. 지금 `@foldkit/ui`의 `Slider.update`는 모든 갈래가
`{ model }` 또는 `{ model, outMessage }`만 돌려주므로 **오늘은 무해하다** — 이것은
증명하지 못했고 "잠재"로 둔다. `outMessage`가 있을 때 `next`(자식이 이미 써 넣어진
Model)로 `goToPage`를 부르는 순서는 `foldChild`와 같다.

### `gotThumbsMessage` — `ApplyScroll`을 버리면서 Model은 중간 상태로 남는다 (증명됨)

```ts
// src/reader/update/thumbs.ts:46
export const gotThumbsMessage = (model, message) => ({
  model: evo(model, { thumbs: () => VirtualList.update(model.thumbs, message).model }),
})
```

`scrollTop !== 0`인 리스트에 `MeasuredContainer`를 먹이면:

|                       | Command            | `thumbs.pendingScroll._tag`                    |
| --------------------- | ------------------ | ---------------------------------------------- |
| 옛 `foldThumbs`       | `ApplyScroll` 있음 | `ScrollingToIndex` → 완료 메시지로 `Idle` 복귀 |
| 새 `gotThumbsMessage` | **없음**           | `ScrollingToIndex`에서 **영영 나오지 못함**    |

주석의 변명("격자는 언제나 맨 위에서 열린다")은 맞다 — `VirtualList.init`에
`initialScrollTop`을 주지 않으므로 이 갈래에 닿지 않는다. 그래도 Command만 버리고
Model 변화는 그대로 받는 것은 `foldChild`와 다른 계약이다. §6대로 이 필드를 들어내면
같이 사라진다.

---

## 8. `src/reader/keys.ts`에 테스트가 없다 — 낮음

`src/page/reader/keys.ts`와 한 글자도 다르지 않은 복사본인데(import 경로와 머리 주석만
다르다), 테스트는 없다. `SPEC.md`의 `R-2A2` 표가 근거로 거는 `reader/keys` 테스트 12개와
`reader/subscription`의 `isReaderKey`/`handlesKeysItself` 테스트는 **여전히 옛 복사본을**
가리킨다. 옛 쪽이 지워지는 날 근거가 함께 지워진다. 복사본이 둘 있는 동안 갈라질 수도
있다. 고치는 값은 작다 — `keys.test.ts`를 새 경로로 복사하거나, 새 `keys.ts`를 지우고
옛 순수 모듈을 Message만 바꿔 쓰게 한다.

---

## 9. 문제가 아닌 것들 (확인함)

- `update.ts`의 나머지 메시지 처리는 순서·`outMessage`·기본값·태그 이름·필드 이름이
  모두 같다. `ElapsedSlide`의 `moved` 판정, `ToggledRememberBookSettings`의 전역 되돌리기,
  `withSettings`의 `Reading.split`, `ClickedToggleSlideshow`의 크롬 비대칭까지 그대로다.
- `update/navigation.ts`의 `goToPage`·`step`·`skip`·`beyondBookEnd`·`entryFor`는 `showPage`에서
  Command 둘이 빠진 것 말고는 같다. `update/gesture.ts`는 `{...tracking}` 전개를 명시 필드로
  푼 것(Data 태그 유니온이라 필요하다)과 함수 위치 이동뿐이다.
- `src/reader/struct.ts`의 `evo`는 `Struct.evolve` 그 자체다 —
  `node_modules/foldkit/dist/struct/index.js`도 `export const evo = Struct.evolve`이므로
  런타임 의미가 같다. `StrictKeys`도 같은 모양으로 다시 적혔다.
- `keys.ts`는 동일, `subscription.ts`의 키 가로채기(`handlesKeysItself` → `isReaderKey` →
  `preventDefault` → `PressedKey{key, withShift}`)와 휠 장치 추정(`deviceFor`에 넘기는 네
  값), 포인터 좌표(`centreRelative`), `ReleasedPointer`의 `timeStamp`/`viewportWidth`는
  모두 같은 입력에 같은 Message를 낸다. `ScrolledToZoom`의 좌표가 인라인에서
  `centreRelative`로 바뀌었지만 식이 동일하다.
- `FailedOpenBook`에서 `spread: SpreadState.Failed`가 빠진 것은 무해하다. `openState`의
  `Failed`가 남고 책 실패는 `reader.tsx`가 book atom에서 읽는다.
- `story.ts`(이관한 이야기 도구)는 답하지 않은 Command를 막는 것, 이야기 끝에 남은
  Command를 실패로 치는 것까지 옛 `foldkit/story`와 같은 규율을 지킨다.
- `vp check`와 `vp test`(500개)가 모두 통과한다. 다만 이 사실은 아무것도 보증하지 않는다 —
  §5가 보여 주듯 재지 않는 테스트도 통과한다.

---

## 판정

**이대로 위에 React 리더를 올리면 안 된다.** 다음 세 가지를 먼저 고쳐야 한다.

1. **§1 `R-207` 굴림.** 지금은 규칙이 꺼져 있다. `roomOnStage`에 스프레드 준비 여부를
   넘기거나, Model이 다시 알게 하거나 — 어느 쪽인지 정하고 근거 테스트를 되살릴 것.
2. **§2 남아 있는 페이지의 `entry`·`half`·`zoom`·`pan`.** 쥔 곳이 없다. 화면 상태의
   모양을 정하는 일이라 리더 화면을 짜기 전에 결정해야 한다.
3. **§4 슬라이드쇼 대기 의존성.** `slideshowSeconds`가 지금 모양이면 `R-2C1`이 훅을
   짜는 순간 조용히 깨진다.

그다음, 리더 화면을 붙이기 전에 **§6**(죽은 슬라이더·썸네일 배선과 슬라이더용 Message
부재)을 정리해야 한다. **§5**와 **§8**은 규칙이 아니라 근거의 문제이므로 `SPEC.md`를
고치는 것으로 같은 커밋에서 끝낼 수 있다. **§7**은 §6과 함께 사라진다.

반대로, `update`의 순수 계산 자체는 믿을 만하다. 메시지 처리 하나하나와 제스처·이동
모듈은 기계적으로 옮겨졌고, `R-214`(늦게 온 답)는 atom 쪽에서 오히려 구조적으로
더 단단해졌다. 고쳐야 하는 것은 **Model 밖으로 내보낸 세 규칙이 밖에서 아무도 받지
않고 있다는 점**이지, 남은 코드가 아니다.
