# comicyuri 동작 명세

현재 구현된 동작을 사용자가 관찰하는 단위로 적은 문서입니다.

## 이 문서에 대하여

**여기 없는 것.** Model 필드 목록은 `src/model.ts`와 `src/page/reader/model.ts`,
Message 목록은 각 `message.ts`, 아키텍처는 `README.md`에 있습니다. 타입이 이미
말하고 있는 것을 산문으로 옮겨 적으면 곧 어긋나므로 넣지 않았습니다. 이 문서에는
**타입이 말할 수 없는 것** — 무엇이 화면에 보이고 무엇이 일어나는가 — 만 있습니다.

**항목 번호**는 보고용입니다. "R-412가 안 된다"처럼 짚어주시면 재현 테스트부터
씁니다.

**검증 표시**의 의미:

|     | 뜻                                                                      |
| --- | ----------------------------------------------------------------------- |
| ✅  | 자동 테스트가 이 동작을 고정하고 있음 (테스트 이름 병기)                |
| 📖  | 코드를 읽은 근거만 있음. 테스트 없음                                    |
| ❓  | **브라우저에서만 확인 가능** — 레이아웃, 실제 포인터 입력, 브라우저 API |
| ⚠️  | 알려진 한계 또는 의도적 미구현                                          |

이 코드는 아직 브라우저에서 실행된 적이 없습니다. ❓ 표시가 지금 수동으로
확인하셔야 할 목록입니다.

**Runtime 전체를 부팅하는 테스트는 쓸 수 없습니다.** vitest + happy-dom에서
`Runtime.run`은 아무것도 렌더링하지 않으며, 최소 Foldkit 앱으로도 같습니다. 이
저장소의 자동 검증은 `update`(story)와 view(scene)까지이고, init·구독·
ManagedResource·라우팅이 실제로 맞물리는지는 브라우저에서만 확인됩니다.

기준 커밋: `19c45e24` · 테스트 82개 통과

---

## 1. 책장

### 1.1 여는 순간

**S-101 · 첫 화면은 로딩과 빈 책장을 구분한다**
책장을 읽는 동안에는 "Opening your shelf…"를 보여주고, 다 읽은 뒤에 책이 없을 때만
"Your shelf is empty" 안내를 보여준다. 두 상태는 다른 화면이다.
✅ scene "a shelf still loading does not claim to be empty"

**S-102 · 책은 최근에 추가한 것이 먼저 온다**
`createdAt` 내림차순.
📖

**S-103 · 각 책은 표지·제목·쪽수를 보여준다**
표지가 없으면 📖 이모지 자리표시자. 쪽수는 `24 pages`, 한 쪽짜리는 `1 page`.
✅ scene "each book is a link named after it, with its page count",
“a single-page book is not announced as '1 pages'”

**S-104 · 책 카드 전체가 그 책으로 가는 링크다**
링크의 접근 가능한 이름은 책 제목이고, `href`는 `/book/<id>`.
✅ scene "each book is a link named after it, with its page count"
❓ 카드 hover·focus 시 살짝 떠오르는 효과

### 1.2 임포트

**S-111 · 책장 어디에 놓아도 임포트된다**
드롭 영역은 책장 전체(`main`, 이름 "Shelf")다. 드래그 중에는 테두리가 강조된다.
파일 선택은 상단 버튼이 맡으므로 드롭 영역 안에는 어떤 입력 요소도 없다.
✅ scene "dropping an archive on the shelf imports it",
"the shelf carries no stray file input"
❓ 드래그 중 테두리 강조

**S-112 · "Open files"는 파일 선택창을 연다**
`.cbz`, `.zip`, 이미지 파일을 여러 개 고를 수 있다.
✅ scene "the open-files button reaches the picker"
❓ 실제 선택창이 뜨는지, accept 필터가 먹는지

**S-113 · "Open folder"는 디렉터리 선택창을 연다**
`webkitdirectory` 기반. 하위 이미지 전체를 폴더명으로 된 책 하나로 묶는다.
📖 ❓ 테스트 경로가 없음 — **브라우저 확인 필요**

**S-114 · 아카이브는 각각 한 권, 낱장 이미지는 묶어서 한 권**
`.cbz`/`.zip`은 파일마다 한 권이고 제목은 확장자를 뗀 파일명. 낱장 이미지는 전부
한 권으로 묶이며, 폴더에서 왔으면 폴더명이 제목이 된다.
📖

**S-115 · 같은 파일을 다시 열면 같은 책이다**
책 id는 `제목::바이트크기`. 그래서 다시 임포트해도 읽던 위치와 북마크가 살아 있다.
📖 ❓

**S-116 · 임포트 중에는 상태줄이 "Importing…"이라고 말하고, 끝나면 사라진다**
✅ scene "dropping an archive on the shelf imports it",
story "picking files imports them and refreshes the shelf"

**S-117 · 임포트가 끝나면 책장이 다시 읽히되, 기존 책은 화면에 남는다**
`Refreshing` 상태라 그리드가 비었다가 다시 그려지지 않는다.
✅ story "picking files imports them and refreshes the shelf"

**S-118 · 선택창을 취소하면 아무 일도 없다**
✅ story "cancelling the picker imports nothing"

**S-119 · 파일이 아닌 것을 드롭하면 그렇게 말한다**
"Couldn't do that — Only files can be dropped here", 4초 뒤 사라짐.
✅ scene "a drop carrying no files is reported rather than imported"

**S-120 · 임포트 시 표지 썸네일을 만든다**
첫 페이지를 400px 이내 webp로 축소해 저장한다. 실패해도 임포트는 성공한다.
📖 ❓ 15초 안에 디코딩되지 않으면 표지 없이 진행

### 1.3 삭제

**S-131 · 카드의 🗑 버튼이 책을 책장에서 지운다**
버튼 이름은 "Remove <제목> from shelf". 평소에는 투명하고 hover·focus 시 보인다.
✅ scene "removing a book from the shelf takes it out of the grid",
"every book gets its own named link and delete control"
❓ hover 시 나타나는 동작

**S-132 · 삭제 후 책장이 다시 읽힌다**
✅ story "deleting a book refreshes the shelf"

**S-133 · 삭제가 실패하면 책은 남고 실패만 보고된다**
✅ story "a failed delete is reported and the book stays"

⚠️ 삭제에 확인 절차가 없다. 누르면 바로 지워지고 되돌릴 수 없다.

### 1.4 테마

**S-141 · 테마 버튼은 갈 곳을 말한다**
다크일 때 "Switch to light theme", 라이트일 때 그 반대. 글리프는 `◐`로 고정.
✅ scene "the theme toggle says where it will take you and applies it"

**S-143 · DevTools 오버레이가 개발 중에 뜬다**
`@foldkit/devtools`가 설치돼 있으면 Vite 플러그인이 개발 빌드에만 주입한다. 기본
위치는 오른쪽 아래. Message 흐름과 Model을 들여다보고 시간을 되감을 수 있다.
📖 ❓ **브라우저 확인 필요**

**S-142 · 테마는 즉시 적용되고 저장된다**
`<html data-theme>`를 바꾼다. 모든 색은 이 속성에서 갈라지는 CSS 변수를 통해 나온다.
✅ story "toggling the theme flips it, persists it and applies it"
❓ **라이트 테마 전체 배색** — 토큰이 실제로 덮이는지

⚠️ 부팅 시 `index.html`이 `data-theme="dark"`로 시작한다. 라이트 사용자는 첫
프레임이 어둡게 보일 수 있다.

---

## 2. 리더

### 2.1 책 열기

**R-201 · 저장된 위치를 안 뒤에 리더를 만든다**
1쪽을 그렸다가 뛰지 않는다. 그동안 "Opening…"을 보여준다.
✅ story "a url change moves the route and asks for the saved position",
scene "a reader route whose position is still loading says so"

**R-202 · 아카이브를 열지 못하면 이유를 말하고 돌아갈 길을 준다**
✅ reader/story "a book that cannot be opened says so instead of showing a stage",
reader/scene "a book that could not be opened offers the way back"

**R-203 · 이미지가 없는 아카이브는 그렇게 말한다**
`No images found in "<제목>"`.
📖

**R-204 · 책을 떠나면 아카이브와 모든 페이지 URL이 해제된다**
ManagedResource가 Model 상태에 따라 해제한다.
📖 ❓ 메모리 해제는 브라우저에서만 관찰 가능

### 2.2 페이지 넘기기

**R-211 · Next / Previous / First / Last**
✅ reader/scene "next turns the page and the counter follows",
"last jumps to the end of the book"

**R-212 · 책 끝에서는 제자리에 머문다**
✅ reader/story "previous on the first page stays put"

**R-213 · 카운터는 현재 스프레드를 보여준다**
한 장이면 `3 / 120`, 두 장이면 `4–5 / 120`.
✅ reader/scene "the stage shows the page and the toolbar counts it"

**R-214 · 이미 지나간 페이지의 이미지가 늦게 도착하면 버린다**
✅ reader/story "a spread that arrives after the reader moved on is discarded"

**R-215 · 앞뒤 스프레드를 미리 읽고, 멀어진 페이지는 해제한다**
양쪽 1스프레드를 미리 읽고 3스프레드 밖은 해제한다.
📖

### 2.3 레이아웃

**R-221 · 읽는 방향 (RTL / LTR)**
버튼이 현재 방향을 보여주고 누르면 뒤집힌다. 두 장 배치에서 페이지 좌우 순서와
탭·스와이프·화살표의 앞뒤가 함께 바뀐다.
✅ reader/scene "the direction control shows and flips the reading direction",
reader/story "in right-to-left reading the left key advances"
❓ **실제로 만화를 넘겨봤을 때 방향이 맞는지**

**R-222 · 한 장 / 두 장 (One / Two)**
두 장 모드에서도 지금 읽던 페이지를 중심으로 다시 묶는다.
✅ reader/story "two-page mode regroups around the page being read"

**R-223 · 두 장 모드에서 표지는 혼자 나온다**
그래서 이후 쌍이 인쇄된 책처럼 맞는다.
📖 ⚠️ 이 설정(`coverAlone`)을 끌 수 있는 UI가 없다. 항상 켜져 있다. 원본 뷰어도
같았다.

**R-224 · 맞춤 모드는 네 가지를 순환한다**
Fit → Width → Height → 1:1 → Fit.
✅ reader/story "cycling the fit mode walks the four modes and comes back",
reader/scene "the fit control names the mode it is in"
❓ **각 모드가 실제로 그렇게 보이는지**

**R-225 · 바꾼 설정은 저장되고 다음 책에도 적용된다**
📖

### 2.4 줌과 팬

**R-231 · 줌 범위는 1배에서 6배**
✅ gesture "zoom is held between one and the maximum"

**R-232 · 두 손가락 핀치로 확대·축소**
손가락 사이 간격에 비례한다. 24px보다 가까운 두 지점은 핀치로 보지 않는다 —
간격 비율로 배율을 정하므로 0에 가까운 간격에서 시작하면 배율이 무한대가 된다.
✅ reader/story "two fingers zoom, and lifting one leaves the other panning"
❓ **실기기 확인 필요**

**R-233 · 확대해도 손가락 사이 지점이 제자리에 머문다**
✅ gesture "what sits under the anchor stays under it"
❓ **좌표 변환이 실제 레이아웃과 맞아야 성립** — 가장 의심스러운 항목

**R-234 · Ctrl+휠 / 트랙패드 핀치로 확대·축소**
📖 ❓ **브라우저 확인 필요**

**R-244 · 브라우저가 닫아주지 않은 제스처는 버린다**
창이 포커스를 잃거나 탭이 배경으로 가면 `pointerup`이 오지 않을 수 있다. 그
상태로 남은 제스처는 돌아와서 누른 손가락을 두 번째 손가락으로 오인한다.
✅ reader/story "leaving the page drops whatever the gesture was holding",
"the same pointer pressing again restarts, it does not pinch",
"a different pointer landing on a stale one is not a pinch either"
❓ **브라우저 확인 필요** — 재현이 불안정한 종류

**R-235 · 확대된 상태에서 끌면 페이지가 넘어가지 않고 이동한다**
✅ reader/story "a drag pans instead of turning the page once zoomed in"

**R-236 · 배율이 1이 되면 위치가 원점으로 돌아온다**
✅ gesture "an unzoomed page has nothing to pan"

**R-239 · 페이지를 넘기면 줌과 위치가 처음으로 돌아온다**
팬 오프셋은 떠나는 페이지에 맞춰 잰 값이라 다음 장에서는 엉뚱한 곳을 가리킨다.
설정만 바꿔 같은 페이지를 다시 그릴 때는 줌을 유지한다.
✅ reader/story "turning the page starts from an unzoomed, unpanned view",
"a settings change keeps the zoom, because the page did not move"

**R-240 · 확대된 상태에서는 휠·트랙패드 스크롤이 페이지를 움직인다**
확대되지 않았을 때는 스크롤을 가로채지 않는다.
✅ reader/story "a wheel scroll moves a zoomed page"
❓ **브라우저 확인 필요**

**R-237 · 두 번 탭하면 2.5배, 다시 두 번 탭하면 원래대로**
세 번째 탭은 방금 한 줌을 되돌리지 않고 새 쌍을 연다. 300ms 안의 두 탭이 한 쌍.
✅ reader/story "a double tap zooms in, and the next pair zooms back out"

**R-238 · 툴바의 −/+ 버튼으로도 확대·축소**
화면 중앙을 기준으로 1.25배씩.
📖 ❓

### 2.5 탭과 스와이프

**R-241 · 화면 바깥쪽 1/3을 탭하면 페이지가 넘어간다**
읽는 방향을 따른다 — RTL에서는 왼쪽 탭이 다음 쪽.
✅ reader/story "a tap on the forward zone turns the page",
gesture "the outer thirds turn pages and the middle shows the chrome"
❓ **실기기 확인 필요**

**R-242 · 가운데를 탭하면 툴바가 숨거나 나타난다**
숨어 있으면 나타나고, 나타나 있으면 숨는다. 화면을 누르는 것 자체는 툴바를
부르지 않는다 — 그랬다면 가운데 탭이 언제나 숨김으로 끝난다.
✅ reader/story "a tap in the middle toggles the chrome and stays on the page",
"a middle tap brings hidden chrome back",
"a press restarts the wait but leaves the chrome as it found it"

**R-243 · 옆으로 45px 넘게 끌면 페이지가 넘어간다**
왼쪽으로 끌면 오른쪽 페이지를 부른다.
✅ gesture "dragging leftwards asks for the page on the right",
reader/story "dragging leftwards asks for the right-hand page"
❓ **실기기 확인 필요**

**R-244 · 10px 이내의 움직임은 탭으로 친다**
📖

### 2.6 툴바 자동 숨김

**R-251 · 3초 동안 아무 일도 없으면 툴바가 사라진다**
사라진 툴바는 탭 순서에서도 빠진다. 썸네일 그리드가 열려 있는 동안에는 숨지
않는다 — 그리드를 닫았을 때 툴바가 사라져 있으면 곤란하다.
✅ reader/story "the wait for the current activity hides it",
subscription "waits before it says the reader has gone idle",
"it does not run out from under an open grid"
❓ 페이드 동작

**R-252 · 컨트롤을 쓰면 툴바가 다시 나오고 대기가 처음부터 다시 간다**
툴바·푸터의 버튼, 슬라이더, 썸네일 선택, 키보드가 모두 해당한다. 툴바를 쓰는
동안 툴바가 사라지지 않는다. 화면을 누르는 것은 대기만 다시 센다 — 누르기가
툴바를 부르면 가운데 탭이 언제나 숨김으로 끝나기 때문이다.
✅ reader/story "the next control restarts the wait" 외 컨트롤 11종,
"a key brings the chrome back",
reader/scene "using the slider brings the chrome back",
"a wait from before the last activity does not hide the chrome",
"a press restarts the wait but leaves the chrome as it found it"

### 2.7 페이지 슬라이더

**R-261 · 슬라이더가 현재 위치를 보여주고 옮긴다**
`aria-valuenow`가 페이지 번호, 이름은 "Page".
✅ reader/scene "the slider carries the reading position and moves it"

**R-262 · 범위는 책을 연 순간 쪽수에 맞춰진다**
✅ reader/story "opening a book gives the slider the book’s range"

**R-263 · 키보드로도 움직인다**
화살표, PageUp/Down, Home/End.
✅ reader/scene "the slider carries the reading position and moves it"
❓ 드래그로 스크럽하는 감각

### 2.8 모든 페이지 (썸네일)

**R-271 · "Pages" 버튼이 전체 페이지 그리드를 연다**
리더 위에 덮이는 패널(`dialog`, 이름 "Every page").
✅ reader/scene "the grid opens over the reader and closes again"

**R-272 · 화면에 보일 만큼만 추출한다**
스크롤 위치에서 창을 계산해 그 주변 2행까지만 읽는다. 500쪽 책이 500장을 풀지 않는다.
✅ thumbs "scrolling asks for the rows around the new position, not the whole book",
reader/story "opening the grid asks only for the thumbnails it can show"
❓ **패널을 여는 순간 실제로 채워지는지** — 컨테이너 높이가 측정되기 전에는 아무
행도 그리지 않는다

**R-273 · 썸네일을 고르면 그 페이지로 가고 패널이 닫힌다**
✅ reader/scene "picking a page from the grid goes there",
reader/story "picking a thumbnail jumps there and closes the grid"

**R-274 · 페이지를 넘겨도 그리드가 비지 않는다**
그리드가 보여주는 페이지는 해제 대상에서 빠진다.
✅ reader/story "a page turn does not release pages the grid is showing"

**R-275 · 북마크된 페이지는 그리드에서 테두리로 구분된다**
📖 ❓

⚠️ 그리드는 반응형이 아니다. 한 행 4개, 행 높이 180px 고정. 가상 리스트로 그리드를
창(window) 처리한 대가다.

### 2.9 북마크

**R-281 · ☆/★ 버튼이 현재 페이지를 북마크한다**
`aria-pressed`가 상태를 반영한다.
✅ reader/scene "the control reflects whether this page is bookmarked"

**R-282 · 북마크는 페이지 순서를 유지한다**
✅ reader/story "bookmarks stay in page order however they were added"

**R-283 · 북마크는 읽던 위치와 같이 저장된다**
✅ reader/story "bookmarking a page reports the new set, and unbookmarking removes it"

⚠️ 북마크 목록을 보거나 사이를 이동하는 UI가 없다. 썸네일 그리드에서 테두리로만
보인다.

### 2.10 전체화면

**R-291 · Full 버튼이 전체화면을 오간다**
✅ reader/story "the control asks, and the document reports what happened"
❓ **브라우저 API — 실제 확인 필요**

**R-292 · 브라우저가 거절하거나 사용자가 브라우저 방식으로 나가도 상태가 맞는다**
Model을 움직이는 것은 요청이 아니라 `fullscreenchange` 이벤트다.
✅ reader/story "leaving fullscreen outside the app is still noticed"
❓

### 2.11 키보드

**R-2A1 · 페이지 넘기기**
`←`/`→` (읽는 방향을 따름), `↑`/`↓`, `PageUp`/`PageDown`, `Space`(다음),
`Home`/`End`.
✅ reader/story "in right-to-left reading the left key advances",
"in left-to-right reading the same key goes back"

**R-2A2 · 토글**
`d` 방향 · `v` 한/두 장 · `t` 썸네일 · `b` 북마크 · `f` 전체화면 · `+`/`-` 줌.
📖

**R-2A3 · Escape는 한 겹씩 벗긴다**
썸네일 → 전체화면 → 책장.
✅ reader/story "escape closes the grid before it leaves anything",
"escape then leaves fullscreen before it leaves the book",
"escape with nothing left open goes back to the shelf"

**R-2A4 · 매핑되지 않은 키는 브라우저로 넘어간다**
리더가 쓰는 키만 가져가고 나머지는 건드리지 않는다. 수정키가 눌린 조합
(Ctrl+R, Cmd+F 등)은 언제나 브라우저 것이다.
✅ reader/story "an unbound key changes nothing",
subscription "a key held with a modifier belongs to the browser",
"everything else falls through to the browser"

⚠️ `Shift`+`Space`(이전)는 구현되지 않았다. 구독이 수정키를 전달하지 않는다.

---

## 3. 저장

**P-301 · 책은 IndexedDB에 남는다**
원본 바이트 그대로. 새로고침해도 책장이 그대로다.
📖 ❓

**P-302 · 읽던 위치와 북마크는 책마다 localStorage에 남는다**
키는 `comicyuri:progress:<book id>`.
📖 ❓

**P-303 · 설정은 localStorage에 남는다**
키는 `comicyuri:settings`. 방향·한두장·맞춤·테마.
📖 ❓

**P-304 · 저장된 값이 깨져 있으면 기본값으로 떨어진다**
스키마로 디코딩하므로, 손상되거나 오래된 항목이 UI에 도달하지 않는다.
📖 ⚠️ `src/storage.ts`를 직접 겨냥한 테스트가 저장소에 없다. 이식 중 임시
스크립트로만 확인했고 그 스크립트는 남기지 않았다 — **테스트 공백**

**P-305 · 오래된 설정 blob은 빠진 항목만 기본값으로 채워진다**
필드마다 디코딩 기본값을 들고 있다.
📖

**P-306 · 저장이 불가능해도 읽기는 계속된다**
시크릿 모드처럼 localStorage를 쓸 수 없어도 조용히 넘어간다.
📖

---

## 4. 주소와 이동

**N-401 · 책장은 `/`, 리더는 `/book/<id>`**
✅ story "a url change moves the route and asks for the saved position"

**N-402 · 뒤로 가기가 책에서 나온다**
📖 ❓

**N-403 · 새로고침해도 읽던 책으로 돌아온다**
📖 ❓

**N-404 · 링크 클릭은 페이지를 다시 읽지 않는다**
✅ story "an internal link click navigates instead of loading the page"

**N-405 · 없는 주소는 안내와 함께 돌아갈 길을 준다**
📖

---

## 5. 실패했을 때

**F-501 · 실패는 상태줄에 4초간 머문다**
"Couldn't do that — <이유>" 형태.
✅ story "a failure starts a wait carrying its own token"

**F-502 · 새 실패가 앞선 실패의 시간을 잡아먹지 않는다**
✅ story "a wait started for an older failure is ignored when it lands"

**F-503 · 실패 메시지가 진행 중인 작업 안내를 지우지 않는다**
✅ story "a wait that lands after an import took over leaves it alone",
"a failure that arrived during an import survives it finishing"

**F-504 · 책장을 읽지 못하면 빈 책장이 아니라 실패를 보여준다**
✅ scene "a shelf that failed to open says so instead of showing an empty grid"

**F-505 · 다시 읽기가 실패해도 이미 있던 책은 남는다**
✅ story "a reload that fails keeps the books it already had"

**F-506 · IndexedDB를 아예 열 수 없어도 실패로 보고된다**
`indexedDB`가 없거나 시크릿 모드처럼 `open`이 던지는 환경에서도 defect가 아니라
`DbError`가 된다.
📖 ❓

**F-507 · 실패 문구**

| 상황                 | 문구                                         |
| -------------------- | -------------------------------------------- |
| IndexedDB            | `Shelf storage is unavailable (<연산>)`      |
| 손상된 아카이브      | `Not a valid ZIP/CBZ archive`                |
| 이미지 없는 아카이브 | `No images found in "<제목>"`                |
| 임포트할 것이 없음   | `No comic files found (images or .cbz/.zip)` |
| 지원하지 않는 압축   | `Unsupported compression method <n>`         |
| 📖                   |

**F-508 · 실패는 색만으로 구분되지 않는다**
전용 색(`--color-danger`)에 더해 "Couldn't do that —" 접두사가 붙는다.
📖 ❓

---

## 6. 알려진 한계

| ID    | 내용                                                                                                                                            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| L-601 | 썸네일 그리드가 반응형이 아니다 (한 행 4개, 180px 고정)                                                                                         |
| L-602 | `coverAlone`을 끌 수 있는 UI가 없다                                                                                                             |
| L-603 | 북마크 목록·이동 UI가 없다                                                                                                                      |
| L-604 | 삭제에 확인 절차가 없다                                                                                                                         |
| L-605 | `Shift`+`Space`가 없다                                                                                                                          |
| L-606 | 부팅 시 라이트 테마 사용자에게 어두운 첫 프레임이 보일 수 있다                                                                                  |
| L-607 | 책장을 다시 읽을 때마다 모든 표지의 object URL을 새로 만든다 — 한 권을 임포트해도 나머지 표지가 다시 그려진다                                   |
| L-608 | 페이지 이미지에 로딩 표시가 없다. 큰 페이지는 "Loading…" 뒤에 갑자기 나타난다                                                                   |
| L-609 | `src/storage.ts`·`src/db.ts`·`src/zip.ts`를 직접 겨냥한 테스트가 없다. 이 계층은 update를 통해서만 간접 검증된다                                |
| L-610 | Runtime 전체를 부팅하는 테스트가 불가능하다 — vitest + happy-dom에서 `Runtime.run`이 아무것도 렌더링하지 않는다 (최소 Foldkit 앱으로 대조 확인) |
| L-611 | 프로덕션 배포 시 `/book/:id` 직접 접근에는 SPA 폴백 설정이 필요하다                                                                             |

---

## 7. 브라우저에서 확인할 목록

❓ 항목만 모은 것입니다. 위에서부터 훑으시면 됩니다.

**배치와 색**

- [ ] S-142 라이트 테마 전체 배색
- [ ] R-224 맞춤 모드 네 가지가 실제로 다르게 보이는지
- [ ] 리더 스테이지가 툴바·푸터를 뺀 높이를 다 쓰는지

**포인터**

- [ ] R-232 핀치 줌
- [ ] R-233 **확대 시 손가락 아래 지점이 제자리인지** (좌표 변환 검증)
- [ ] R-234 Ctrl+휠 / 트랙패드 핀치
- [ ] R-241 탭 존이 방향에 맞는지
- [ ] R-243 스와이프 방향

**브라우저 API**

- [ ] R-291 전체화면 진입·이탈
- [ ] S-113 폴더 열기
- [ ] P-301~303 새로고침 후 책장·위치·설정 유지

**타이밍**

- [ ] R-272 썸네일 패널이 열리는 즉시 채워지는지
- [ ] R-251 툴바 3초 자동 숨김
