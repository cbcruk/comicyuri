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
| 🔍  | 브라우저에서 직접 확인함 (확인 날짜 병기)                               |
| ⚠️  | 알려진 한계 또는 의도적 미구현                                          |

❓ 표시가 아직 손으로 확인해야 할 목록이고, 확인이 끝난 항목은 🔍로 바뀝니다.

**vitest에서는 Runtime 전체를 부팅할 수 없습니다.** happy-dom에서 `Runtime.run`은
아무것도 렌더링하지 않으며, 최소 Foldkit 앱으로도 같습니다. `vp test`가 덮는 것은
`update`(story)와 view(scene)까지입니다.

**그 너머는 `vp run e2e`가 덮습니다.** Playwright가 프로덕션 빌드를 띄우고 실제
Chromium에서 앱을 몰아 봅니다 — 레이아웃과 계산된 색, 두 손가락 핀치를 포함한
포인터 입력, Fullscreen API, 폴더 선택창, 그리고 새로고침을 넘겨 남는지. init·구독·
ManagedResource·라우팅이 맞물리는지도 여기서만 드러납니다. 테스트 이름은 이 문서의
항목 번호로 시작합니다.

기준 커밋: `cb8b7608` · 단위 테스트 216개, 브라우저 테스트 39개 통과

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
✅ scene "the open-files button reaches the picker",
e2e "S-112 · \"Open files\"가 여러 개를 고를 수 있는 선택창을 연다"
❓ accept 필터가 실제로 먹는지 — 선택창이 거르는 것은 앱 바깥이라 관찰할 수 없다

**S-113 · "Open folder"는 디렉터리 선택창을 연다**
`webkitdirectory` 기반. 하위 이미지 전체를 폴더명으로 된 책 하나로 묶는다.
✅ e2e "S-113 · 폴더를 고르면 폴더 이름의 책 한 권이 된다"

**S-114 · 아카이브는 각각 한 권, 낱장 이미지는 묶어서 한 권**
`.cbz`/`.zip`은 파일마다 한 권이고 제목은 확장자를 뗀 파일명. 낱장 이미지는 전부
한 권으로 묶이며, 폴더에서 왔으면 폴더명이 제목이 된다.
📖

**S-115 · 같은 파일을 다시 열면 같은 책이다**
책 id는 `제목::바이트크기`. 그래서 다시 임포트해도 읽던 위치와 북마크가 살아 있다.
✅ e2e "S-115 · 같은 파일을 다시 열면 같은 책이고, 읽던 자리도 그대로다"

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

**S-121 · 임포트 시 페이지마다 픽셀 크기를 재 둔다**
이미지를 디코딩하지 않고 헤더만 읽는다. PNG·JPEG·GIF·WebP·BMP·AVIF를 알아보고,
JPEG는 EXIF 회전을 반영해 브라우저가 그릴 모양대로 잰다. 알아보지 못한 형식은
실패가 아니라 크기를 모르는 페이지로 남는다. 잰 값은 책 레코드에 들어가므로
`R-226`이 읽는 도중에 다시 재지 않는다.
✅ imageSize "a PNG is measured from its IHDR" 외 14개,
e2e "S-121 · 잰 크기는 새로고침을 넘겨 남는다"
⚠️ 이 동작이 생기기 전에 들여온 책에는 크기가 없다. 다시 들여와야 재어진다.

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
📖 ❓ **브라우저 확인 필요** — 브라우저 테스트는 프로덕션 빌드를 띄우므로 이
오버레이가 없는 쪽을 본다.

**S-142 · 테마는 즉시 적용되고 저장된다**
`<html data-theme>`를 바꾼다. 모든 색은 이 속성에서 갈라지는 CSS 변수를 통해 나온다.
✅ story "toggling the theme flips it, persists it and applies it",
e2e "S-142 · 라이트로 바꾸면 토큰이 실제로 덮인다", "S-142 · 고른 테마는
새로고침을 넘긴다"

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

**R-212 · 책 끝에서 무엇을 할지는 설정이 정한다**
`atBookEnd`가 셋 중 하나다. `next`(기본)는 이웃한 책으로 이어 읽고(`R-216`),
`wrap`은 같은 책의 반대쪽 끝으로 돌아가며, `stop`은 제자리에 머문다.
✅ reader/story "previous on the first page stays put",
"set to wrap, the end of the book leads back to its start"

**R-213 · 카운터는 현재 스프레드를 보여준다**
한 장이면 `3 / 120`, 두 장이면 `4–5 / 120`.
✅ reader/scene "the stage shows the page and the toolbar counts it"

**R-217 · 카운터 아래에 지금 걸린 파일 이름이 붙는다**
아카이브 안에서의 이름이고, 폴더는 떼어 낸 것이다. 두 장이 걸리면 읽는 순서대로 둘
다 보인다. 긴 이름은 줄여서 보여 주고, 통째로는 `title` 속성에 남는다.

번호만으로는 정렬이 어긋난 것을 알아볼 수 없다. 아카이브는 이름순으로 서는데 그
이름이 사람의 기대와 다른 책이 있고, 그때 몇 번째 장인지가 아니라 어느 파일인지가
단서가 된다. 툴바와 함께 숨으므로(`R-251`) 읽는 동안 눈에 걸리지 않는다.
✅ reader/scene "the counter says which files are on screen",
e2e "R-217 · 카운터 아래에 아카이브 안의 파일 이름이 보인다", "R-217 · 두 장이 걸리면
이름도 둘이다"

**R-214 · 이미 지나간 페이지의 이미지가 늦게 도착하면 버린다**
✅ reader/story "a spread that arrives after the reader moved on is discarded"

**R-215 · 앞뒤 스프레드를 미리 읽고, 멀어진 페이지는 해제한다**
양쪽 1스프레드를 미리 읽고 3스프레드 밖은 해제한다.
📖

**R-216 · 책의 끝을 넘기면 이웃한 책이 그 자리에서 열린다**
마지막 장에서 계속 넘기면 책장 순서상 다음 책이, 첫 장에서 뒤로 넘기면 앞 책이
열린다. 책장으로 돌아갈 필요가 없다. 이웃한 책은 책장에서 열 때와 똑같이 저장된
위치에서 시작한다(`N-403`).

책장의 끝에서는 아무 일도 일어나지 않고 제자리에 머문다. 책장을 아직 읽는 중일
때도 마찬가지다 — 순서를 모르는 채로 짐작해 여는 것보다 낫다.

책 사이를 오가는 별도의 버튼은 없다. 원본 뷰어에서도 책의 끝을 넘기는 동작이 곧
다음 권을 여는 동작이었고, 따로 만들면 두 기능이 겹친다.
✅ book "a step forward lands on the next book in shelf order", "the shelf does not
wrap around at either end",
reader/story "turning past the last page asks for the book after this one",
"turning back from the first page asks for the book before this one",
e2e "R-216 · 마지막 장에서 넘기면 다음 권이 열린다", "R-216 · 첫 장에서 뒤로 넘기면
앞 권으로 돌아간다", "R-216 · 책장의 끝에서는 제자리에 머문다"
⚠️ 읽는 순서는 책장 순서 그대로다. 책장은 최근에 들여온 것이 앞이므로(`S-102`),
한 권씩 따로 들여오면 순서가 뒤집힌다. 한 번에 들여오면 제목순으로 선다.

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
그래서 이후 쌍이 인쇄된 책처럼 맞는다. 설정 패널에서 끌 수 있다(`R-2B1`).
✅ spreads "two-page mode leaves the cover alone so the pairs after it line up",
"without the cover rule the pairing starts at the first page"

**R-224 · 맞춤 모드는 네 가지를 순환한다**
Fit → Width → Height → 1:1 → Fit.
Fit은 화면 안에 통째로, Width는 너비를, Height는 높이를 채우고, 1:1은 원래 픽셀
크기다. 세로로 긴 페이지에서는 Fit과 Height가 같은 그림이 된다 — 정의상 Fit은 먼저
닿는 쪽을 따른다.

Fit과 1:1은 줄이기만 하고 늘리지 않는다. 화면보다 작은 페이지는 원래 크기 그대로
선다. 채우는 두 모드(Width·Height)만 늘리고, 그것을 멈추는 것이 `R-2B4`다.
✅ reader/story "cycling the fit mode walks the four modes and comes back",
reader/scene "the fit control names the mode it is in",
e2e "R-224 · Fit은 페이지를 화면 안에 통째로 넣는다", "R-224 · Width는 너비를
채운다", "R-224 · Height는 높이를 채운다", "R-224 · 1:1은 원래 픽셀 크기로 둔다",
"R-224 · 통째로 맞춤은 켜 두어도 작은 페이지를 늘리지 않는다"

**R-225 · 바꾼 설정은 저장되고 다음 책에도 적용된다**
📖

**R-226 · 가로로 넓은 페이지는 두 장 모드에서도 혼자 나온다**
가로세로비가 `singleThreshold`(기본 0.740)를 넘으면 짝을 짓지 않는다. 책 중간의
양면 삽화나 눕혀 스캔한 쪽이 그것이다. 그 앞 장도 홀로 남는다 — 옆에 세울 짝이
없다. 그래서 넓은 페이지 하나가 그 뒤의 모든 쌍을 한 장씩 밀어내지 않는다.
크기를 모르는 페이지는 넓지 않은 것으로 쳐서, `S-121` 이전에 들여온 책은 예전
그대로 묶인다.
✅ spreads "a wide page in the middle is shown on its own", "the page before a wide
one is left alone rather than paired across it", "one wide page does not push every
pair after it off by one",
reader/story "a wide page is read on its own and the pairs after it stay in step",
e2e "R-226 · 넓은 페이지는 두 장 모드에서도 혼자 나온다"

**R-227 · 묶기를 손으로 뒤집을 수 있다**
두 장 모드에서 `⇹` 버튼과 `s` 키가 지금 보고 있는 스프레드의 묶기를 뒤집는다.
두 장이 보이고 있으면 앞 장을 혼자 세우고, 한 장만 보이고 있으면 다음 장과 묶는다.
같은 자리에서 두 번 누르면 처음 보던 묶음으로 돌아온다.

손으로 건 표시는 `R-226`의 자동 판정을 이긴다. 그러지 못하면 탈출구가 아니다.
표시는 읽던 자리·북마크와 같은 자리에 책마다 저장된다(`P-302`). 한 장 모드에는
뒤집을 묶기가 없어서 버튼도 없다.
✅ spreads "a page told to stand alone does, however narrow it is", "a page told to
pair does, however wide it is", "a page bound to the next one wins over the cover
rule",
reader/story "flipping the binding splits the spread being read, and saves it",
"flipping twice comes back to the spread it started from", "flipping binds a wide
page back to its neighbour", "one-page mode has no binding to flip",
reader/scene "the binding control is only there when there is a binding to flip",
e2e "R-227 · 자동 묶기를 손으로 뒤집고, 그것이 새로고침을 넘긴다", "R-227 · 넓다고
갈라 놓은 페이지를 손으로 다시 묶는다", "R-227 · 한 장 모드에는 뒤집을 묶기가 없다"

**R-229 · 넓은 페이지를 좌우 반씩 읽는다**
설정 패널의 "Read wide pages in halves". 켜 두면 혼자 선 넓은 페이지가 두 걸음이
된다 — 읽는 방향으로 먼저 오는 반쪽, 그다음 나머지 반쪽. 양면을 한 장으로 스캔한
페이지가 세로 화면에서 통째로 작게 들어가는 것을 막는 자리다. 오른쪽에서 왼쪽으로
읽으면 오른쪽 반이 먼저다.

무엇이 넓은지는 스프레드 묶기와 같은 판정(`R-226`의 `singleThreshold`)이다. 옆에
짝이 선 페이지는 나누지 않는다 — 한 화면에 네 쪽이 된다.

반쪽으로 옮기는 걸음은 이미지를 새로 부르지 않는다. 같은 이미지의 다른 쪽을 볼
뿐이다. 뒤로 넘겨 들어온 페이지는 나중에 읽는 반쪽에서 시작한다(`R-247`과 같은
규칙).

반쪽은 언제나 화면 안에 통째로 들어간다. 반쪽의 비를 지고 컨테이너 단위로 잰
상자가 이미지를 잘라 내므로, 맞춤 모드(`R-224`)와 무관하고 세워 둔 페이지(`R-228`)도
따라간다.
✅ half "a step forward from the first half stays on the page", "right to left reads the
right half first",
reader/story "the second half comes before the next page, and needs no new image",
"stepping back into a wide page lands on the half read last", "a page that is not wide is
one step, however the setting is set",
reader/scene "a wide page shows one half at a time when the setting is on",
e2e "R-229 · 넓은 페이지가 두 걸음으로 나뉜다", "R-229 · 뒤로 넘겨 오면 나중에 읽는
반쪽이 나온다", "R-229 · 반쪽은 화면 안에 통째로 들어간다"

⚠️ 카운터는 반쪽을 세지 않는다. 두 걸음 모두 같은 페이지 번호다.

**R-228 · `⟳` 버튼과 `r` 키가 페이지를 시계 방향으로 세운다**
한 번에 90도씩, 네 번이면 제자리다. 눕혀 스캔된 책을 바로 세우는 자리다.

세운 페이지에도 맞춤 모드가 화면 크기대로 걸린다. 페이지를 담은 상자가 함께 눕기
때문이다 — 90도나 270도로 돌린 상자는 화면의 높이만큼 넓고 화면의 너비만큼 높다
(`100cqh`·`100cqw`). 상자를 그대로 둔 채 돌리기만 하면 세운 페이지가 화면의 절반도
쓰지 못한다.

각도는 읽는 사람의 습관이 아니라 그 책이 어떻게 스캔되었는지를 적는 것이다. 그래서
설정이 아니라 묶기 교정과 같이 책마다 저장된다(`P-302`). 기억하기 스위치(`R-2B3`)와
무관하게 언제나 남는다.
✅ rotation "four turns come back around", "a quarter turn swaps the sides of the box, a
half turn does not",
reader/story "rotating reports the new angle with the position", "rotating leaves the
page and the zoom where they were", "a book opens at the angle it was left at",
reader/scene "turning the page upright lays the box it sits in on its side",
e2e "R-228 · 세운 페이지는 눕힌 상자에 맞춰진다", "R-228 · 네 번 세우면 제자리로
돌아온다", "R-228 · 세워 둔 각도는 그 책에 남는다"

⚠️ 썸네일 격자는 세워지지 않는다. 눕혀 스캔된 책은 격자에서 계속 누워 있다.
⚠️ 세운 채로 너비 맞춤을 하면 넘치는 방향이 화면의 가로가 된다. 굴려서 읽는
것(`R-240`)은 화면의 세로를 따라가므로, 그 자리에서는 휠이 페이지를 넘긴다.

### 2.4 줌과 팬

**R-231 · 줌 범위는 1배에서 6배**
✅ gesture "zoom is held between one and the maximum"

**R-232 · 두 손가락 핀치로 확대·축소**
손가락 사이 간격에 비례한다. 24px보다 가까운 두 지점은 핀치로 보지 않는다 —
간격 비율로 배율을 정하므로 0에 가까운 간격에서 시작하면 배율이 무한대가 된다.
✅ reader/story "two fingers zoom, and lifting one leaves the other panning",
e2e "R-232 · 두 손가락을 벌리면 그만큼 확대된다"
❓ 실기기의 손가락 감각

**R-233 · 확대해도 손가락 사이 지점이 제자리에 머문다**
손가락이 하나씩 따로 도착하므로 그 사이 순간에는 두 손가락의 한가운데가 잠깐
쏠리고, 그만큼 몇 픽셀이 남는다. 잘게 움직이면 눈에 띄지 않는다.
✅ gesture "what sits under the anchor stays under it",
e2e "R-233 · 확대해도 손가락 사이 지점이 제자리에 머문다"

**R-234 · Ctrl+휠 / 트랙패드 핀치로 확대·축소**
✅ e2e "R-234 · Ctrl+휠로 확대하고 축소한다"

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
📌 굴려서 옮긴 자리는 배율과 무관하다(`R-240`). 여기서 말하는 것은 확대를 풀 때다.

**R-239 · 페이지를 넘기면 줌과 위치가 처음으로 돌아온다**
어느 쪽이 그 페이지의 "처음"인지는 `R-247`이 정한다.
팬 오프셋은 떠나는 페이지에 맞춰 잰 값이라 다음 장에서는 엉뚱한 곳을 가리킨다.
설정만 바꿔 같은 페이지를 다시 그릴 때는 줌을 유지한다.
✅ reader/story "turning the page starts from an unzoomed, unpanned view",
"a settings change keeps the zoom, because the page did not move"

**R-240 · 휠·트랙패드로 굴리면 페이지가 그만큼 움직인다**
확대해서 커진 페이지든, 너비에 맞춰 화면보다 길어진 페이지든 같다. 남은 거리보다
더 가지는 않는다 — 페이지는 화면 밖으로 밀려나지 않는다.

페이지가 어느 쪽으로 얼마나 더 갈 수 있는지는 CSS가 정한다. 맞춤 모드와 두 장
배치와 배율이 모두 걸리므로 리더는 그것을 셈하지 않고, 휠 이벤트가 그때 재어 온다.
✅ scroll "scrolling down moves the page up", "scrolling stops where the page ends",
reader/story "a wheel scroll moves a zoomed page",
e2e "R-240 · 굴리면 페이지가 그만큼 움직인다"

**R-246 · 마우스 휠로 끝에 닿은 뒤 다시 굴리면 페이지가 넘어간다**
아래로 굴려 페이지의 끝에 닿아 있으면 다음 장, 위로 굴려 처음에 닿아 있으면 앞
장이다. 화면에 통째로 들어가는 페이지는 처음부터 양쪽 끝에 닿아 있으므로, 한 칸
굴리는 것이 곧 한 장 넘기는 것이다. 끝에 닿기까지 굴린 그 이벤트로는 넘어가지
않는다 — 그 이벤트는 남은 거리를 움직이는 데 쓰였다. 가로로 굴리는 것도 넘기지
않는다.

**넘기는 것은 마우스 휠뿐이다.** 트랙패드는 끝에 닿으면 거기서 멈춘다. 트랙패드는
손가락을 뗀 뒤에도 관성으로 이벤트를 흘리므로, 그 흐름 속에서 "한 번 더 굴렸다"를
가려내려면 굴림이 멎기를 기다려야 하고, 그러면 넘기려고 몇 번씩 밀어야 한다 —
2026-09-10에 실제로 그랬다. 마우스 휠은 한 칸이 한 이벤트라 그런 판정이 필요 없다.

둘을 가르는 것은 판정이 아니라 짐작이다. 브라우저는 같은 이벤트로 보내고 어느
쪽인지 말해 주지 않는다. 줄·페이지 단위로 오면 마우스이고(파이어폭스), 픽셀
단위라면 `wheelDeltaY`가 120의 배수인 것이 마우스다(크로미움·사파리). 가로 성분이
섞여 있으면 트랙패드다.
✅ scroll "scrolling down at the bottom asks for the next page", "a page that fits is
already at both of its edges", "a mouse wheel carries a multiple of 120", "a trackpad
carries how far the fingers went", "anything sideways is a trackpad",
reader/story "a page with nowhere left to go turns instead", "the scroll that reaches the
edge does not also turn the page", "a trackpad stops at the edge instead of turning",
e2e "R-246 · 끝에 닿은 뒤 다시 굴리면 페이지가 넘어간다", "R-246 · 화면에 통째로
들어가는 페이지는 한 번 굴리면 넘어간다"
❓ 실제 트랙패드에서 넘어가지 않는지 — 하네스가 만드는 휠 이벤트는 언제나 마우스다

**R-247 · 페이지는 들어선 쪽에서 시작한다**
앞으로 넘겨 온 페이지는 첫 줄부터, 뒤로 넘겨 온 페이지는 끝에서 시작한다. 되돌아
읽는 움직임과 맞는다. 화면에 통째로 들어가는 페이지에는 처음도 끝도 없으므로 어느
쪽에서 들어서든 가운데다. 슬라이더나 격자로 건너뛴 것은 넘긴 것이 아니라 언제나
처음이다.

세우는 일은 CSS가 한다(`items-center-safe`, 그리고 뒤로 왔을 때 `flex-wrap-reverse`).
재고 나서 옮기는 것이 아니라 처음부터 그 자리에 그려지므로, 긴 페이지가 가운데
걸렸다가 튀는 일이 없다. 페이지를 담은 상자는 페이지 번호를 키로 삼는다 — 그러지
않으면 앞 페이지를 굴려 둔 자리에서 새 페이지가 미끄러져 들어온다.
✅ reader/story "scrolling back at the top enters the page before it at its end", "a page
entered forwards starts at its start", "jumping is not turning, so a jump starts at the
start",
reader/scene "a page taller than the screen hangs off the end it was entered from",
e2e "R-247 · 앞으로 넘겨 온 긴 페이지는 첫 줄부터 보인다", "R-247 · 뒤로 넘겨 온 긴
페이지는 끝에서 시작한다"

**R-237 · 가운데를 두 번 탭하면 2.5배, 다시 두 번 탭하면 원래대로**
300ms 안의 두 탭이 한 쌍이고, 세 번째 탭은 방금 한 줌을 되돌리지 않고 새 쌍을
연다. **가운데에서만** 성립한다 — 바깥 1/3은 페이지 넘김 전용이라, 빠르게 두 번
탭하면 두 장이 넘어간다. 빨리 읽는 것과 확대 요청은 다른 일이다.
✅ reader/story "two quick taps in the middle still zoom",
"two quick taps on a turning zone turn two pages",
"a turning tap does not pair with a middle tap that follows",
"a double tap zooms in, and the next pair zooms back out"

**R-238 · 툴바의 −/+ 버튼으로도 확대·축소**
화면 중앙을 기준으로 1.25배씩.
📖 ❓

### 2.5 탭과 스와이프

**R-241 · 화면 바깥쪽 1/3을 탭하면 페이지가 넘어간다**
읽는 방향을 따른다 — RTL에서는 왼쪽 탭이 다음 쪽. 이 영역은 페이지 넘김 외에
아무 일도 하지 않는다.
✅ reader/story "a tap on the forward zone turns the page",
gesture "the outer thirds turn pages and the middle shows the chrome",
e2e "R-241 · 오른쪽에서 왼쪽으로 읽을 때 왼쪽 1/3 탭이 앞으로 넘긴다"

**R-245 · 탭으로 페이지가 넘어가면 그 쪽 가장자리가 잠깐 빛난다 (개발 빌드만)**
같은 만화의 두 장은 서로 닮아서, 페이지가 넘어간 것이 "같은 그림이 움직였다"로
읽힐 수 있다. 그래서 페이지가 **실제로 바뀐 경우에만** 넘어온 쪽을 표시한다 —
책 끝에서 깜빡이면 일어나지 않은 일을 주장하는 셈이다. 가운데 탭은 표시하지
않는다(툴바가 이미 답이다).
✅ reader/story "a tap that turns the page marks the side it came from",
"a tap at the end of the book marks nothing",
"a tap in the middle marks nothing either",
"tapping the same side again restarts the mark"
❓ **브라우저 확인 필요** — 260ms 페이드가 실제로 읽히는지
⚠️ 프로덕션 빌드에서는 그리지 않는다. 넘어간 사실은 Model에 기록되지만 화면에
나타나지 않으므로, 배포된 앱에서는 여전히 "같은 그림이 움직였다"로 읽힐 수 있다.

**R-242 · 가운데를 탭하면 툴바가 숨거나 나타난다**
숨어 있으면 나타나고, 나타나 있으면 숨는다. 화면을 누르는 것 자체는 툴바를
부르지 않는다 — 그랬다면 가운데 탭이 언제나 숨김으로 끝난다.
✅ reader/story "a tap in the middle toggles the chrome and stays on the page",
"a middle tap brings hidden chrome back",
"a press restarts the wait but leaves the chrome as it found it"

**R-243 · 옆으로 45px 넘게 끌면 페이지가 넘어간다**
왼쪽으로 끌면 오른쪽 페이지를 부른다.
페이지 이미지는 끌 수 없게 해 두었다. 그러지 않으면 브라우저가 이미지 드래그를
시작하면서 포인터 이벤트를 거두어 가고, 스와이프가 첫 움직임 뒤에 잘린다.
✅ gesture "dragging leftwards asks for the page on the right",
reader/story "dragging leftwards asks for the right-hand page",
e2e "R-243 · 옆으로 끌면 그 반대쪽 페이지를 부른다"

**R-244 · 10px 이내의 움직임은 탭으로 친다**
📖

### 2.6 툴바 자동 숨김

**R-251 · 3초 동안 아무 일도 없으면 툴바가 사라진다**
사라진 툴바는 탭 순서에서도 빠진다. 다음 두 경우에는 시간이 흐르지 않는다 —
썸네일 그리드가 열려 있을 때(닫았더니 툴바가 없으면 곤란하다), 그리고 포인터가
툴바 위에 있을 때(아직 쓰는 중이다). 포인터가 벗어나면 대기가 처음부터 다시
간다.
✅ reader/story "the wait for the current activity hides it",
subscription "waits before it says the reader has gone idle",
"it does not run out from under an open grid",
"holds the wait for as long as it is there",
reader/story "entering holds it, and leaving starts the wait over",
e2e "R-251 · 3초 동안 아무 일도 없으면 툴바가 사라지고, 다시 만지면 돌아온다",
"R-251 · 포인터가 툴바 위에 있는 동안에는 시간이 흐르지 않는다"
❓ 페이드가 눈에 어떻게 보이는지

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
`aria-valuenow`가 트랙 위의 자리, `aria-valuetext`가 페이지 번호, 이름은 "Page".
✅ reader/scene "reading left to right, it runs the usual way"

**R-262 · 범위는 책을 연 순간 쪽수에 맞춰진다**
✅ reader/story "opening a book gives the slider the book’s range"

**R-263 · 키보드로도 움직인다**
화살표, PageUp/Down, Home/End.
✅ reader/scene "reading left to right, it runs the usual way"
❓ 드래그로 스크럽하는 감각

**R-264 · 오른쪽에서 왼쪽으로 읽으면 슬라이더도 뒤집힌다**
첫 페이지가 오른쪽 끝이고, 읽을수록 thumb이 왼쪽으로 간다. 채워진 구간은 읽은
만큼이므로 오른쪽 끝에서 thumb까지다 — 컴포넌트는 늘 자기 최솟값(왼쪽)부터
채우기 때문에, 이 방향에서는 트랙과 채움의 색이 자리를 바꾼다. 푸터의 버튼
순서도 함께 뒤집힌다. 페이지 번호는 뒤집히지 않으므로 `aria-valuetext`는 그대로
1부터 센다.
✅ reader/scene "reading right to left, the slider starts full and empties
leftward", "reading right to left, the filled part of the track sits on the
right", "reading left to right, the fill is the fill", "the row of controls
turns around with the reading direction", "and reading left to right it stays
as written"
🔍 2026-09-09 · 만화를 넘겨보며 채워지는 쪽과 줄어드는 쪽을 확인함

**R-265 · 슬라이더에 포커스가 있는 동안에는 리더가 키를 양보한다**
슬라이더는 화살표·Home/End·PageUp/Down을 스스로 처리하고, 리더의 키 구독은
문서에 걸려 있다. 양보하지 않으면 한 번 누른 키가 두 번 세어진다 — 같은 방향
두 페이지(LTR)이거나 서로 밀어내기(RTL).
✅ subscription "the page slider keeps the keys it handles", "and so does
anything inside it", "everything else leaves the key to the reader"
🔍 2026-09-09 · 슬라이더에 포커스를 준 뒤 화살표가 한 번에 한 페이지만 넘기는 것을
확인함

### 2.8 모든 페이지 (썸네일)

**R-271 · "Pages" 버튼이 전체 페이지 그리드를 연다**
리더 위에 덮이는 패널(`dialog`, 이름 "Every page").
✅ reader/scene "the grid opens over the reader and closes again"

**R-272 · 화면에 보일 만큼만 추출한다**
스크롤 위치에서 창을 계산해 그 주변 2행까지만 읽는다. 500쪽 책이 500장을 풀지 않는다.
✅ thumbs "scrolling asks for the rows around the new position, not the whole book",
reader/story "opening the grid asks only for the thumbnails it can show",
e2e "R-272 · 패널을 여는 순간 썸네일이 채워진다"

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

**R-284 · 그리드를 북마크만으로 좁힌 것이 북마크 목록이다**
그리드 머리의 "Bookmarks" 버튼이 늘어놓을 페이지를 북마크된 것으로 바꾼다. 목록을
따로 만들지 않고 이미 있는 격자를 좁힌다 — 썸네일도 창(window) 처리도 그대로 쓴다.
아무것도 북마크하지 않은 책은 빈 격자 대신 그렇다고 말한다.
✅ thumbs "filtered to bookmarks, only those pages", "a filtered grid windows over the
bookmarks, not over the page numbers",
reader/scene "the grid can be narrowed to what is bookmarked", "a book with nothing
bookmarked says so instead of showing an empty grid",
e2e "R-284 · 그리드를 북마크만으로 좁힌다"

**R-285 · `[`/`]`가 앞뒤 북마크로 건너뛴다**
`]`는 지금 페이지 뒤의 첫 북마크로, `[`는 앞의 마지막 북마크로 간다. 읽는 방향과
무관하다 — 여기서 "다음"은 언제나 책의 뒤쪽이다. 그쪽에 북마크가 더 없으면 제자리에
머문다. 책의 끝(`R-212`)과 달리 감아 돌지 않는다 — 감아 돌면 어디까지 봤는지 알 수
없게 된다.
✅ bookmark "a step forward lands on the first bookmark after this page", "standing on a
bookmark steps past it rather than staying", "past the last bookmark there is nowhere
forward to go",
reader/story "the bracket keys step from one bookmark to the next and back", "with no
bookmark left that way the page stays where it is",
e2e "R-285 · `[`/`]`가 앞뒤 북마크로 건너뛴다"

⚠️ 목록에서 북마크를 지울 수는 없다. 지우려면 그 페이지로 가서 ★를 끈다.

### 2.10 전체화면

**R-291 · Full 버튼이 전체화면을 오간다**
✅ reader/story "the control asks, and the document reports what happened",
e2e "R-291 · Full 버튼이 전체화면을 오간다"

**R-292 · 브라우저가 거절하거나 사용자가 브라우저 방식으로 나가도 상태가 맞는다**
Model을 움직이는 것은 요청이 아니라 `fullscreenchange` 이벤트다.
✅ reader/story "leaving fullscreen outside the app is still noticed",
e2e "R-292 · 브라우저 쪽에서 나가도 상태가 맞는다"

### 2.11 설정 패널

**R-2B1 · ⚙ 버튼과 `,` 키가 읽기 설정 패널을 연다**
툴바에 버튼이 없던 설정 다섯이 여기 있다 — 표지를 혼자 둘지(`coverAlone`), 넓은
페이지를 가르는 문턱(`singleThreshold`), 넓은 페이지를 반씩 읽을지(`splitWide`), 작은
페이지를 늘릴지(`enlargeToFit`), 책의 끝에서 무엇을 할지(`atBookEnd`).

방향·한 장/두 장·맞춤은 여기 없다. 그것들은 읽는 동안 손이 가는 것이라 툴바에
남고, 여기 있는 셋은 책을 열기 전에 한 번 정하는 것이다.

패널에서 바꾼 것은 곧바로 배치에 반영되고 다른 설정과 같이 저장된다(`P-303`).
✅ reader/scene "the settings that have no toolbar button live here",
"turning the cover rule off reports the new settings", "turning off stretching caps the
page at its own size", "picking what happens at the end of a book reports it",
reader/story "a setting picked in the panel lays the book out again at once",
e2e "R-2B1 · ⚙ 버튼이 패널을 열고 닫는다", "R-2B1 · 표지를 혼자 두지 않기로 하면
배치가 바로 바뀌고 새로고침을 넘긴다", "R-2B1 · 책 끝 동작을 고르면 그대로 남는다"

**R-2B2 · 문턱은 0.02씩 움직이고 0.50과 1.00 사이에 머문다**
`−`는 더 많이 묶고 `+`는 더 적게 묶는다. 끝에 닿은 버튼은 `aria-disabled`가 된다.
더한 값은 소수 두 자리에서 끊는다 — 0.02를 거듭 더하면 그러지 않고서는 0.74가
0.7400000000000001이 된다.
✅ reader/story "the threshold stops at the ends of its range",
reader/scene "nudging the threshold moves it one step, not to a long decimal"

**R-2B3 · 설정을 책마다 기억할 수 있다**
패널의 "Remember these for each book"를 켜면, 그 뒤로 바꾸는 배치가 전역 기본값이
아니라 그 책에 남는다. 책마다 남는 것은 방향·한 장/두 장·맞춤·표지 규칙·넓은 페이지
문턱·반씩 읽기·늘리기다. 테마와 책 끝 동작, 그리고 이 스위치 자신은 읽는 습관이라 전역에 남는다.

스위치를 켜는 것은 지금 보고 있는 배치를 이 책의 것으로 삼는다는 뜻이다. 끄면 이
책이 정한 것을 놓고 전역 기본값으로 돌아간다 — 그러지 않으면 이 책의 배치가 그대로
전역 기본값이 되어 다음에 여는 책까지 따라간다.

묶기 교정(`R-227`)은 이 스위치와 무관하게 언제나 책마다 남는다. 그것은 취향이
아니라 그 책에 대한 사실이다.
✅ reading "flipping the direction in one book does not follow the reader to the
next", "what a book saved is what it opens with again", "with the switch off, what a
book remembers is not used",
reader/story "remembering for each book keeps the global defaults where they were",
"turning remembering off puts the global defaults back", "a book opens on what it
remembered, not on the global defaults",
e2e "R-2B3 · 책마다 기억하기를 켜면 방향이 그 책에만 남는다", "R-2B3 · 스위치를
끄면 전역 기본값으로 돌아간다"

**R-2B4 · 작은 페이지를 화면에 맞춰 늘릴지 정한다**
패널의 "Stretch small pages to fit". 켜 두는 것이 기본이고, 끄면 채우는 맞춤
(Width·Height)이 원본 크기를 넘지 않는다. 저해상도 스캔본에서 갈린다 — 늘리면 화면을
채우는 대신 뭉개지고, 끄면 선명한 대신 작게 선다.

상한은 그 이미지의 원래 크기(`max-content`)다. 원본 뷰어는 배수를 골랐지만
(`Max enlargement:`), 여기서는 켜고 끄는 것 하나로 줄였다 — 늘리지 않기로 하면
보간 방식을 고를 이유도 함께 사라진다.
✅ reader/scene "turning off stretching caps the page at its own size",
e2e "R-2B4 · 켜 두면 작은 페이지가 너비를 채운다", "R-2B4 · 끄면 원래 크기를 넘지
않는다", "R-2B4 · 끈 것은 새로고침을 넘긴다"

### 2.12 키보드

**R-2A1 · 페이지 넘기기**
`←`/`→` (읽는 방향을 따름), `↑`/`↓`, `PageUp`/`PageDown`, `Space`(다음),
`Home`/`End`. `Home`/`End`은 방향과 무관하게 책의 첫 장·마지막 장이다.
✅ reader/story "in right-to-left reading the left key advances",
"in left-to-right reading the same key goes back"
📌 슬라이더에 포커스가 있을 때는 R-265에 따라 리더가 물러난다.
📌 `[`/`]`는 앞뒤 북마크로 건너뛴다 (R-285).

**R-2A2 · 토글**
`d` 방향 · `v` 한/두 장 · `s` 묶기 뒤집기 · `r` 세우기 · `t` 썸네일 · `,` 설정 ·
`b` 북마크 · `f` 전체화면 · `+`/`-` 줌.
📖

**R-2A3 · Escape는 한 겹씩 벗긴다**
설정 → 썸네일 → 전체화면 → 책장.
✅ reader/story "escape closes the settings panel before anything else"
✅ reader/story "escape closes the grid before it leaves anything",
"escape then leaves fullscreen before it leaves the book",
"escape with nothing left open goes back to the shelf"

**R-2A4 · 매핑되지 않은 키는 브라우저로 넘어간다**
리더가 쓰는 키만 가져가고 나머지는 건드리지 않는다. Ctrl·Cmd·Alt가 눌린 조합
(Ctrl+R, Cmd+F 등)은 언제나 브라우저 것이다. Shift는 예외로, 리더가 자기 것으로
쓰는 유일한 수정키다(`R-2A5`).
✅ reader/story "an unbound key changes nothing",
subscription "a key held with a modifier belongs to the browser",
"everything else falls through to the browser"

**R-2A5 · Shift는 넘김 키를 크게 만든다**
넘김 키와 함께 누르면 한 장이 아니라 열 장을 건너뛴다. 방향은 그대로 눈에 보이는
쪽을 따른다(`R-2A1`). 건너뛰기는 책의 양 끝에서 멈춘다 — 책을 벗어나는 것은 넘김의
일이지(`R-212`) 건너뛰기의 일이 아니다.

`Space`만은 예외로, `Shift`와 함께라면 뒤로 간다. 오래된 관례이고, 한 손으로 읽을
때 되돌아갈 길이 된다.

건너뛰는 장수는 열 장으로 고정이다. 원본 뷰어는 이 값을 고르게 했지만, 크게 움직이는
다른 길이 이미 둘 있다 — 슬라이더(`R-261`)와 썸네일 격자(`R-271`).
✅ reader/story "shift and a turn key skips a stretch of pages", "a skip stops at the ends
of the book instead of leaving it", "shift and space goes back, the way it always has",
e2e "R-2A5 · Shift와 함께 누른 넘김 키가 열 장을 건너뛴다", "R-2A5 · 건너뛰기는 책의
끝에서 멈춘다", "R-2A5 · Shift+Space는 뒤로 간다"

---

## 3. 저장

**P-301 · 책은 IndexedDB에 남는다**
원본 바이트 그대로. 새로고침해도 책장이 그대로다.
✅ e2e "P-301 · 책은 새로고침을 넘겨 책장에 남는다"

**P-302 · 책마다 남는 것은 읽던 위치·북마크·묶기 교정·세운 각도, 그리고 그 책의 설정이다**
키는 `comicyuri:progress:<book id>`. 나중에 붙은 항목들은 모두 디코딩 기본값을 지고
있어서, 그것들이 생기기 전에 저장된 책도 읽던 자리와 북마크를 잃지 않는다.

그 책의 설정은 `Option`이 아니라 `null`로 저장한다. `Schema.Option`이 인코딩하는
모양은 JSON을 거쳐 그대로 디코딩되지 않는다.
✅ storage "position, bookmarks, bindings and rotation survive the round trip", "settings of
its own survive the round trip", "saving settings keeps the position and bookmarks
already stored", "a record written before books could remember anything still reads",
e2e "P-302 · 읽던 위치와 북마크가 남는다"

**P-303 · 설정은 localStorage에 남는다**
키는 `comicyuri:settings`. 방향·한두장·맞춤·테마·책 끝 동작.
✅ e2e "P-303 · 설정은 남고 다음 책에도 적용된다"

**P-304 · 저장된 값이 깨져 있으면 기본값으로 떨어진다**
스키마로 디코딩하므로, 손상되거나 오래된 항목이 UI에 도달하지 않는다.
✅ storage "a settings blob that no longer decodes falls back rather than reaching
the app"

**P-305 · 오래된 설정 blob은 빠진 항목만 기본값으로 채워진다**
필드마다 디코딩 기본값을 들고 있다.
✅ storage "a blob written by an older build gains the fields it never had"

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
| L-604 | 삭제에 확인 절차가 없다                                                                                                                         |
| L-606 | 부팅 시 라이트 테마 사용자에게 어두운 첫 프레임이 보일 수 있다                                                                                  |
| L-607 | 책장을 다시 읽을 때마다 모든 표지의 object URL을 새로 만든다 — 한 권을 임포트해도 나머지 표지가 다시 그려진다                                   |
| L-608 | 페이지 이미지에 로딩 표시가 없다. 큰 페이지는 "Loading…" 뒤에 갑자기 나타난다                                                                   |
| L-609 | `src/db.ts`·`src/zip.ts`를 직접 겨냥한 테스트가 없다. 이 계층은 update를 통해서만 간접 검증된다                                                 |
| L-610 | Runtime 전체를 부팅하는 테스트가 불가능하다 — vitest + happy-dom에서 `Runtime.run`이 아무것도 렌더링하지 않는다 (최소 Foldkit 앱으로 대조 확인) |
| L-611 | 프로덕션 배포 시 `/book/:id` 직접 접근에는 SPA 폴백 설정이 필요하다                                                                             |
| L-612 | 설정 패널이 리더 안에만 있다. 책장에서는 테마 말고 아무것도 바꿀 수 없다                                                                        |

---

## 7. 브라우저에서 확인할 목록

이 목록에 있던 항목은 대부분 `vp run e2e`가 가져갔습니다. Playwright가 프로덕션
빌드를 띄우고 Chromium에서 직접 확인합니다 — 무엇을 덮는지는 각 항목의 ✅ e2e
표시에 있습니다.

**하네스가 가져간 것** (2026-09-09)

- [x] S-113 폴더 열기
- [x] S-142 라이트 테마 전체 배색
- [x] R-224 맞춤 모드 네 가지 · 스테이지가 툴바·푸터를 뺀 높이를 다 쓰는지
- [x] R-232 핀치 줌 · R-233 확대 시 손가락 아래 지점 · R-234 Ctrl+휠
- [x] R-240 굴려서 페이지를 움직이는 것 · R-246 끝에서 넘어가는 것 · R-247 들어선 쪽
- [x] R-241 탭 존 방향 · R-243 스와이프 방향 · R-244 탭 판정
- [x] R-251 툴바 3초 자동 숨김과 포인터가 붙잡는 것
- [x] R-272 썸네일 패널이 열리는 즉시 채워지는지
- [x] R-291 · R-292 전체화면
- [x] P-301~303 새로고침 후 책장·위치·설정 유지

**여전히 사람 눈이 필요한 것**

- [ ] R-251 툴바가 사라지고 나타나는 페이드가 눈에 어떻게 보이는지
- [ ] R-232 실기기에서 두 손가락의 감각
- [ ] R-246 마우스 휠과 트랙패드를 가르는 짐작이 실제 장치에서 맞는지 — 하네스가
      만드는 휠 이벤트는 언제나 마우스로 보인다
- [ ] R-244 창이 포커스를 잃어 `pointerup`이 오지 않는 경우 — 재현이 불안정하다

**확인 완료**

- [x] R-264 RTL에서 슬라이더가 오른쪽에서 왼쪽으로 채워지고 줄어드는 감각 (2026-09-09)
- [x] R-265 슬라이더 포커스 중 화살표가 한 번에 한 페이지만 넘기는지 (2026-09-09)
