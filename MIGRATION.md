# Foldkit → React + Effect Atom 이관 지침

이 브랜치(`migrate/react-atom`)는 앱을 Foldkit에서 React와 Effect Atom으로 옮긴다. 옮기는
동안 두 앱이 각자의 문서로 나란히 선다. `index.html`이 Foldkit, `app.html`이 React이고, 다
옮기면 뒤쪽이 `index.html`이 되고 Foldkit 쪽 파일과 의존성이 사라진다.

## 원칙

1. **기계적으로 옮긴다.** 동작을 바꾸지 않는다. 더 나은 설계가 보여도 이관 중에는 적지
   않는다. `SPEC.md`의 규칙 번호(`R-207`, `S-142` 같은 것)가 그대로 지켜져야 한다.
2. **테스트가 정답지다.** e2e 108개와 story 테스트가 옮기기 전과 같은 것을 말해야 한다.
   테스트를 고쳐서 통과시키지 않는다. 테스트가 틀렸다고 판단되면 고치지 말고 보고한다.
3. **줄일 것은 나중에 줄인다.** 이관이 끝나고 e2e가 모두 통과한 뒤에 정리한다.

## 무엇이 무엇이 되나

| Foldkit                   | 옮긴 뒤                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| `Runtime.makeApplication` | `src/app/main.tsx` (React root + `RegistryProvider`)             |
| `view` (`h.div` 빌더)     | React 컴포넌트 (`.tsx`), 스타일은 Tailwind 클래스 그대로         |
| `@foldkit/ui` 컴포넌트    | `@astryxdesign/core` (Slider·Switch·Dialog·FileInput·Toolbar 등) |
| `VirtualList`             | `@tanstack/react-virtual`                                        |
| `Route` / `foldkit/url`   | `@tanstack/react-router` (`src/app/router.tsx`)                  |
| `Command`                 | `Atom.fn` 또는 이벤트 핸들러에서 `Effect.runPromise`             |
| `ManagedResource`(책)     | `src/atoms/pages.ts`의 책·페이지 atom (이미 옮김)                |
| `Subscription`            | 이름 붙인 훅 (`useReaderKeys`, `useSlideshow` 같은 것)           |
| `Submodel`                | 컴포넌트 지역 상태 또는 atom                                     |
| scene 테스트              | `*.screen.test.tsx` (실제 Chromium, `vp run test:screen`)        |
| story 테스트              | 그대로 둔다. `update`가 순수 함수로 남기 때문이다                |

## 상태를 두는 자리

- **리더의 상호작용 상태**(페이지, 배율, 이동, 제스처, 툴바 표시, 슬라이드쇼)는 **atom 하나**에
  담고, 그 atom은 지금의 순수 `update(model, message)`로만 바꾼다. 여러 필드가 한 번에
  움직여야 하는 규칙(`R-207`, `R-214`, 가운데 탭)이 거기 달려 있다. story 테스트 2,400여 줄이
  그대로 사는 것도 이 때문이다.
- **리소스와 비동기**(책 열기, 페이지 로딩, 썸네일)는 atom이 맡는다. 이미 옮긴
  `src/atoms/pages.ts`가 본보기다.
- **화면 순간의 상태**(메뉴가 열렸는지, 슬라이더를 끄는 중인지, 포커스)는 Astryx 컴포넌트에
  맡긴다. Model에 넣지 않는다.
- `SPEC.md`가 말하는 것은 Model에, 말하지 않는 것은 컴포넌트에 둔다고 보면 대체로 맞다.

## 옮기지 않는 것

`src/io/`, `src/domain/`, `src/spreads.ts`, `src/settings.ts`, `src/types.ts`, `src/errors.ts`,
그리고 `src/page/reader/`의 순수 계산(`spread.ts`, `gesture.ts`, `keys.ts`, `half.ts`,
`scroll.ts`, `rotation.ts`, `thumbs.ts`, `bookmark.ts`)은 Foldkit을 불러오지 않는다. 그대로 쓴다.

## 규칙

- 주석·커밋·`SPEC.md`는 한국어다. 백틱 안의 인용과 테스트 이름은 영어로 둔다.
- 내보내는 모든 심벌에 JSDoc을 단다(`.claude/rules/jsdoc.md`).
- 동작이 바뀌면 `SPEC.md`의 해당 항목과 근거로 적힌 테스트 이름을 같이 고친다.
- 검증: `vp check`, `vp test`, `vp run test:screen`, `vp run e2e`.
- Foldkit Vite 플러그인은 `src/` 아래 모든 함수를 감싸므로, 다 옮기기 전까지 React 쪽 번들에도
  Foldkit 조각이 섞인다. 크기를 재려면 플러그인을 뺀 별도 빌드로 재야 한다.

## 진행 상태

- [x] 기반: 의존성, 스타일 레이어, `app.html`, 라우터, 프로바이더, 화면 테스트 하네스
- [x] 페이지 로딩 atom (`src/atoms/pages.ts`, `browser.ts`)
- [ ] 책장: 들여오기(FileInput·드롭), 카드와 표지, 지우기, 정렬
- [ ] 리더: Model·Message·update 이관, 제스처와 확대, 키보드
- [ ] 툴바와 메뉴바(`Toolbar` + `DropdownMenu`), 푸터와 슬라이더
- [ ] 설정 패널(`Dialog`, `Switch`)
- [ ] 썸네일 격자(TanStack Virtual)
- [ ] 저장(진행 상태·설정·테마) 연결
- [ ] scene 테스트를 `*.screen.test.tsx`로 옮기기
- [ ] e2e를 React 앱으로 돌려 108개 통과시키기
- [ ] 갈아타기: `app.html` → `index.html`, Foldkit 파일과 의존성 삭제, `SPEC.md` 갱신
