# comicyuri 동작 명세

현재 구현된 동작을 사용자가 관찰하는 단위로 적은 문서입니다.

## 이 문서에 대하여

**여기 없는 것.** Model 필드 목록은 `src/reader/model.ts`, Message 목록은
`src/reader/message.ts`, 아키텍처는 `README.md`에 있습니다. 타입이 이미
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

**테스트 이름 앞의 접두사**는 그 테스트가 어디서 도는지를 말합니다.

- **`*/screen`은 화면 테스트입니다.** `vp run test:screen`이 실제 Chromium에
  컴포넌트를 세워 놓고 눌러 봅니다 — `shelf/screen`, `shelfNotice/screen`,
  `chrome/screen`, `reader/screen`, `settings/screen`, `thumbs/screen` 여섯입니다.
  `shelfNotice/screen`만 저장소를 가짜로 갈아 끼웁니다. 거절하는 저장소와 늦게 답하는
  저장소는 진짜 IndexedDB로 만들 수 없기 때문입니다. Foldkit의 scene
  테스트가 하던 일을 이것이 이어받았습니다.
- **나머지 접두사는 `vp test`가 돌리는 단위 테스트**이고, 접두사가 곧 파일입니다 —
  `reader/story`·`reader/subscription`·`keys`·`scroll`·`gesture`·`half`·`rotation`·
  `bookmark`·`thumbs`는 `src/reader/`, `zip`·`loader`·`db`·`storage`·`imageSize`는
  `src/io/`, `book`·`reading`은 `src/domain/`, `state/*`는 `src/app/state/`,
  `pages`는 `src/atoms/pages.ts`, `spreads`는 `src/spreads.ts`의 것입니다.
- **`e2e`는 `vp run e2e`입니다.** Playwright가 프로덕션 빌드를 띄우고 실제
  Chromium에서 앱을 몰아 봅니다 — 레이아웃과 계산된 색, 두 손가락 핀치를 포함한
  포인터 입력, Fullscreen API, 폴더 선택창, 그리고 새로고침을 넘겨 남는지. atom과
  구독과 라우팅이 맞물리는지도 여기서만 드러납니다. 테스트 이름은 이 문서의 항목
  번호로 시작합니다.

기준 커밋: `ccb77c46` · 단위 321개 · 화면 85개 · e2e 109개 통과

---

## 1. 책장

### 1.1 여는 순간

**S-101 · 첫 화면은 로딩과 빈 책장을 구분한다**
책장을 읽는 동안에는 "Opening your shelf…"를 보여주고, 다 읽은 뒤에 책이 없을 때만
"Your shelf is empty" 안내를 보여준다. 두 상태는 다른 화면이다.
✅ shelf/screen "an empty shelf says so"
📖 읽는 중인 책장이 비었다고 말하지 않는 쪽 — 재는 테스트가 없다

**S-102 · 책은 최근에 추가한 것이 먼저 온다**
`createdAt` 내림차순. 뷰가 아니라 저장 계층이 정한다(`P-301`).
✅ db "the most recently imported book comes first",
shelf/screen "books are listed newest first, each a link named after it"

**S-103 · 각 책은 표지·제목·쪽수를 보여준다**
표지가 없으면 📖 이모지 자리표시자. 쪽수는 `24 pages`, 한 쪽짜리는 `1 page`.
✅ shelf/screen "books are listed newest first, each a link named after it",
'a single-page book is not announced as "1 pages"'

**S-104 · 책 카드 전체가 그 책으로 가는 링크다**
링크의 접근 가능한 이름은 책 제목이고, `href`는 `/book/<id>`.
✅ shelf/screen "books are listed newest first, each a link named after it"
❓ 카드 hover·focus 시 살짝 떠오르는 효과

### 1.2 임포트

**S-111 · 책장 어디에 놓아도 임포트된다**
드롭 영역은 책장 전체(`main`, 이름 "Shelf")다. 드래그 중에는 테두리가 강조된다.
파일 선택은 상단 버튼이 맡으므로 드롭 영역 안에는 어떤 입력 요소도 없다.
✅ shelf/screen "a drop carrying no files is reported rather than imported"
📖 드롭 영역 안에 입력 요소가 하나도 없는 것, 그리고 아카이브를 놓으면 실제로 들여오는
것 — 둘 다 재는 테스트가 없다
❓ 드래그 중 테두리 강조

**S-112 · "Open files"는 파일 선택창을 연다**
`.cbz`, `.zip`, 이미지 파일을 여러 개 고를 수 있다.
✅ e2e "S-112 · \"Open files\"가 여러 개를 고를 수 있는 선택창을 연다"
❓ accept 필터가 실제로 먹는지 — 선택창이 거르는 것은 앱 바깥이라 관찰할 수 없다

**S-113 · "Open folder"는 디렉터리 선택창을 연다**
`webkitdirectory` 기반. 하위 이미지 전체를 폴더명으로 된 책 하나로 묶는다.
✅ e2e "S-113 · 폴더를 고르면 폴더 이름의 책 한 권이 된다"

**S-114 · 아카이브는 각각 한 권, 낱장 이미지는 묶어서 한 권**
`.cbz`/`.zip`은 파일마다 한 권이고 제목은 확장자를 뗀 파일명. 낱장 이미지는 전부
한 권으로 묶이며, 폴더에서 왔으면 폴더명이 제목이 된다. 둘이 섞여 있으면 둘 다
나온다.

페이지가 될 수 있는 것은 `jpg`·`jpeg`·`png`·`gif`·`webp`·`avif`·`bmp`이고 대소문자를
가리지 않는다. 그 밖의 것은 고른 목록에 섞여 있어도 그냥 빠지고, 남는 것이 하나도
없을 때만 실패한다.

책장에 서는 순서는 이름순이다. `Intl.Collator`에 `numeric`을 주므로 10이 2 뒤에
온다 — 고른 순서가 아니라 읽을 순서다.
✅ loader "each archive is a book of its own, titled without the extension", "loose images
are one book, in name order", "images from a folder take the folder name", "archives and
loose images chosen together make both kinds", "anything that is neither is left out",
"choosing nothing importable is a failure, not an empty shelf", "the image formats this
viewer can stand a page on", "what is not a page", "an archive is a .cbz or a .zip,
whatever the case"

**S-115 · 같은 파일을 다시 열면 같은 책이다**
책 id는 `제목::바이트크기`. 그래서 다시 임포트해도 읽던 위치와 북마크가 살아 있다.
✅ e2e "S-115 · 같은 파일을 다시 열면 같은 책이고, 읽던 자리도 그대로다"

**S-116 · 임포트 중에는 상태줄이 "Importing…"이라고 말하고, 끝나면 사라진다**
✅ shelfNotice/screen "the line says it is importing, and says nothing once the book is in"

**S-117 · 임포트가 끝나면 책장이 다시 읽히되, 기존 책은 화면에 남는다**
`Refreshing` 상태라 그리드가 비었다가 다시 그려지지 않는다.

표지도 그대로 남는다. 책장을 다시 읽는 쪽이 지금 쥐고 있는 표지를 함께 받아서,
그대로 남은 책에는 새 object URL을 만들지 않고 받은 것을 되돌려 준다. 다시 만들면
카드마다 `src`가 바뀌어서 한 권을 들여왔을 뿐인데 나머지 표지가 전부 다시 그려진다.

놓아 주는 것은 밀려난 URL뿐이다 — 두 책장에 다 있는 URL은 아직 화면의 `img`가
쥐고 있다.
✅ book "each cover is paired with the book it belongs to", "a cover that both shelves hold
is not dropped", "only the cover of a book that left is dropped", "a book whose cover was
made afresh drops the one it replaced",
shelf/screen "a cover that both shelves hold is not dropped, and only the one that left is",
e2e "S-117 · 한 권을 더 들여와도 이미 선 책의 표지 URL이 그대로다", "S-117 · 남은
표지는 한 권을 지운 뒤에도 그대로다"
📖 임포트가 끝난 뒤 책장을 `Refreshing`으로 다시 읽어 기존 책이 화면에 남는 것 — 재는
테스트가 없다

**S-118 · 선택창을 취소하면 아무 일도 없다**
취소는 실패가 아니라 빈 목록이다. 아무것도 고르지 않은 것과 구별하지 않는다.
✅ shelfNotice/screen "cancelling the picker imports nothing and says nothing"

**S-119 · 파일이 아닌 것을 드롭하면 그렇게 말한다**
"Couldn't do that — Only files can be dropped here", 4초 뒤 사라짐.
✅ shelf/screen "a drop carrying no files is reported rather than imported"

**S-120 · 임포트 시 표지 썸네일을 만든다**
첫 페이지를 400px 이내 webp로 축소해 저장한다. 실패해도 임포트는 성공한다.
📖 ❓ 15초 안에 디코딩되지 않으면 표지 없이 진행

**S-121 · 임포트 시 페이지마다 픽셀 크기를 재 둔다**
이미지를 디코딩하지 않고 헤더만 읽는다. PNG·JPEG·GIF·WebP·BMP·AVIF를 알아보고,
JPEG는 EXIF 회전을 반영해 브라우저가 그릴 모양대로 잰다. 알아보지 못한 형식은
실패가 아니라 크기를 모르는 페이지로 남는다. 잰 값은 책 레코드에 들어가므로
`R-226`이 읽는 도중에 다시 재지 않는다.
한 장이 무너뜨리는 것은 그 한 자리뿐이다. 알아보지 못한 형식이든 아예 뽑지 못한
페이지든 `null`로 남고, 나머지는 그대로 재어진다 — 555장짜리 책이 한 장 때문에
들어오지 못하면 곤란하다.
✅ imageSize "a PNG is measured from its IHDR" 외 15개,
loader "a page whose header is read comes back with its size", "a page in a format this
viewer does not know leaves a hole", "a page that cannot even be read leaves a hole, not a
failure",
e2e "S-121 · 잰 크기는 새로고침을 넘겨 남는다"
⚠️ 이 동작이 생기기 전에 들여온 책에는 크기가 없다. 다시 들여와야 재어진다.

### 1.3 삭제

**S-131 · 카드의 🗑 버튼이 지울지 묻는다**
버튼 이름은 "Remove <제목> from shelf…". 평소에는 투명하고 hover·focus 시 보인다.
누르면 지우는 것이 아니라 물음이 카드를 덮는다 — "Remove this book and where you left
off?"와 함께 "Remove"(이름 "Remove <제목> from shelf")와 "Keep"(이름 "Keep <제목>")이
선다.

묻는 것은 지우는 것이 되돌릴 수 없고 그 책의 읽던 자리까지 함께 가기 때문이다. 🗑은
카드 위에 떠 있어서 책을 누르려다 스칠 수 있다.

물음은 카드를 통째로 덮고 그동안 링크는 `inert`가 되므로, 답하기 전에는 포인터로도
키보드로도 그 책이 열리지 않는다. 물음과 답을 같은
자리에 두지 않는 이유도 같다 — 🗑이 있던 곳에 "Remove"가 서면 두 번째 누름이 첫
번째와 같은 동작처럼 보이고, 그 자리는 손이 이미 가 있는 자리다.

한 번에 한 책만 묻는다. 다른 카드의 🗑을 누르면 물음이 그쪽으로 옮겨 간다. 책장을
떠나면 물음도 접힌다.
✅ shelf/screen "the bin asks rather than deletes, and keeping the book leaves the shelf as
it was", "removing a book from the shelf takes it out of the grid", "the question stands on
one card only",
e2e "S-131 · 🗑은 묻기만 하고, 지키기를 고르면 책이 남는다", "S-131 · 지우기를 고르면
책장에서 사라지고 새로고침을 넘겨 돌아오지 않는다", "S-131 · 묻는 동안에는 그 카드로
들어갈 수 없다", "S-131 · 다른 책을 열었다 돌아오면 묻던 것이 남아 있지 않다"
❓ hover 시 나타나는 동작

**S-132 · 삭제 후 책장이 다시 읽힌다**
✅ shelf/screen "removing a book from the shelf takes it out of the grid"

**S-133 · 삭제가 실패하면 책은 남고 실패만 보고된다**
✅ shelfNotice/screen "a failed delete is reported and the book stays"

⚠️ 되돌리기는 없다. 답하고 나면 그 책의 바이트도 읽던 자리도 돌아오지 않는다.

### 1.4 테마

**S-141 · 테마 버튼은 갈 곳을 말한다**
다크일 때 "Switch to light theme", 라이트일 때 그 반대. 글리프는 `◐`로 고정.
✅ shelf/screen "the theme toggle says where it will take you and applies it"

**R-2B6 · 같은 설정 패널을 책장에서도 연다**
책장 헤더의 ⚙. 리더의 것과 같은 항목이 같은 순서로 서고 이름도 같다 —
"Reading settings"다. 뷰가 한 벌이라서, 한쪽에 항목을 더하면 다른 쪽에도 선다.

여는 자리에 따라 보여 주는 값이 다르다. 리더에서는 그 책에 걸린 것까지 합친
결과이고(`R-2B3`), 책장에서는 전역 기본값 그대로다. 책장에는 책이 없으므로 바꾼
것을 가를 것도 없다 — 그대로 모든 책의 기본값이 된다.

그래서 책을 열지 않고도 이어 읽기 방식이나 책 끝 동작을 정할 수 있다. 그 둘은
책을 여는 순간의 동작이라, 정하려고 책을 열어야 하는 것이 앞뒤가 맞지 않았다.

스위치의 `id` 앞머리만 갈라 둔다(`reader-`/`shelf-`). 둘이 한 문서에 설 일은
없지만, 같은 `id`를 둔 채 그렇게 되면 라벨이 어느 쪽을 가리키는지 알 수 없다.
✅ settings/screen "the settings that have no toolbar button live here", "the threshold
stops at the ends of its range", "the slideshow delay stops at the ends too", "choosing how
a part-read book opens reports it",
e2e "R-2B6 · 책장에서 정한 기본값이 그 뒤에 여는 책에 걸린다", "R-2B6 · 책장에서 정한
것이 새로고침을 넘기고, 리더의 패널에도 그대로 보인다"
📖 책장의 ⚙이 리더와 같은 패널을 여는 것과 스위치 `id` 앞머리가 갈리는 것 — 화면
테스트는 패널만 따로 세우므로 재지 않는다
⚠️ 레이아웃 항목은 책장에서 눌러도 효과가 보이지 않는다. 페이지가 화면에 없기
때문이다. 그래도 한 자리에 모아 둔다 — "모든 책의 기본값"이 두 벌로 갈리는 것이 더
헷갈린다.

**S-143 · DevTools 오버레이 — 지금은 없다**
`@foldkit/devtools`가 개발 빌드에만 주입하던 오버레이다. Message 흐름과 Model을
들여다보고 시간을 되감는 자리였다. React와 Effect Atom으로 옮기면서 Foldkit과 함께
빠졌고, 대신할 것은 아직 두지 않았다.
⚠️ 지금 앱에는 없는 기능이다.

**S-142 · 테마는 즉시 적용되고 저장된다**
`<html data-theme>`를 바꾼다. 모든 색은 이 속성에서 갈라지는 CSS 변수를 통해 나온다.
브라우저가 자기 UI를 칠하는 `theme-color`도 함께 옮긴다 — 그 값에는 CSS 변수가 닿지
않으므로 따로 적어 준다.
✅ shelf/screen "the theme toggle says where it will take you and applies it",
e2e "S-142 · 라이트로 바꾸면 토큰이 실제로 덮인다", "S-142 · 고른 테마는
새로고침을 넘긴다", "S-144 · 테마를 바꾸면 브라우저에 알리는 색도 함께 간다"

**S-144 · 첫 프레임이 이미 고른 테마다**
`index.html`의 인라인 스크립트가 저장된 설정에서 테마를 읽어 첫 페인트 전에
세운다. 앱도 `ApplyTheme`으로 같은 일을 하지만 그것은 모듈이 받아져 돌기 시작한
뒤라, 그때까지 라이트를 고른 사람은 어두운 화면을 한 번 보고 만다.

그 자리에서는 스키마를 쓸 수 없으므로 읽은 것을 믿지 않는다. 저장소가 없거나
JSON이 깨졌거나 `theme`이 아는 값이 아니면 아무것도 하지 않고, 문서가 이미 지고
있는 어두운 기본값이 그대로 남는다.

브라우저에서만 드러난다. 모듈을 길에서 1.5초 붙잡아 두고, 그동안 `#root`가 비어
있는 채로 화면에 무엇이 그려져 있는지 보았다.

|                                                                                       | 앱이 뜨기 전 바탕    |
| ------------------------------------------------------------------------------------- | -------------------- |
| 인라인 스크립트가 없을 때                                                             | `rgb(20, 20, 26)`    |
| 있을 때                                                                               | `rgb(244, 242, 247)` |
| ✅ e2e "S-144 · 라이트를 고른 사람은 어두운 첫 프레임을 보지 않는다", "S-144 · 다크를 |
| 고른 사람의 첫 프레임은 그대로 어둡다"                                                |

---

## 2. 리더

### 2.1 책 열기

**R-201 · 저장된 위치를 안 뒤에 리더를 만든다**
1쪽을 그렸다가 뛰지 않는다. 그동안 "Opening…"을 보여준다.
📖 재는 테스트가 없다

**R-202 · 아카이브를 열지 못하면 이유를 말하고 돌아갈 길을 준다**
✅ reader/story "a book that cannot be opened says so instead of showing a stage"
📖 그 화면이 함께 주는 돌아갈 길 — 재는 테스트가 없다

**R-203 · 이미지가 없는 아카이브는 그렇게 말한다**
`No images found in "<제목>"`. 바이트를 잃은 레코드도 같은 말을 한다. ZIP이 아닌
바이트는 아카이브의 실패(`F-507`)로 나온다.

아카이브 안에서 페이지가 되는 것은 이름이 이미지인 엔트리뿐이고, macOS가 남기는
`__MACOSX` 아래는 그 이름을 하고 있어도 빠진다. 페이지의 이름은 폴더를 뗀 것이다 —
카운터 아래에 서는 것이 그 이름이다(`R-217`).
✅ loader "an archive with no images says so rather than opening empty", "a record that
lost its bytes says the same", "bytes that are not an archive fail as an archive would",
"the images inside stand as pages, in name order, by their own names", "what macOS leaves
in an archive is not a page", "loose images keep the order and the names they were stored
with"

**R-204 · 책을 떠나면 아카이브와 모든 페이지 URL이 해제된다**
URL의 수명은 페이지 atom의 스코프다. 만드는 것과 놓는 것을 `Effect.acquireRelease`가
한 쌍으로 묶어 두므로, 그 페이지를 원하는 곳이 하나도 남지 않으면 — 멀어졌든 책을
떠났든 — 레지스트리가 atom을 치우면서 URL도 함께 놓는다. 디코딩보다 먼저 걸어 두어
디코딩 도중에 치워져도 URL이 남지 않는다.

같은 페이지를 동시에 부를 때 URL이 새는 길이 있었고 막았다. 미리 읽지 않은 페이지로
가면 화면에 걸 스프레드와 미리 읽을 이웃이 같은 페이지를 한꺼번에 부른다. 둘 다 URL이
없다고 보고 각자 만들면 캐시는 나중 것만 기억하고, 화면에 걸린 먼저 것은 끝내 해제되지
않았다. 페이지의 `load`는 이제 한 번에 하나씩 돌고, 기다린 호출은 앞선 호출이 만든 URL을
받는다. atom 쪽은 페이지마다 하나뿐이라 구조적으로 겹치지 않는다.
✅ loader "a page asked for twice at once makes one URL", "a page let go by the preloader
can still be loaded again",
pages "a page two spreads want at once is unpacked into one URL", "leaving the book leaves
no page URL behind", "a spread left while its pages are still decoding gives the URLs back
too",
e2e "R-204 · 멀리 건너뛰었다가 책을 떠나도 페이지 URL이 남지 않는다", "R-204 · 페이지를
풀고 있는 순간에 책을 떠나도 URL이 남지 않는다"

**R-205 · ZIP 리더가 읽는 것과 거절하는 것**
중앙 디렉터리를 파싱해 엔트리를 적힌 순서대로 세우고, 페이지는 필요할 때 하나씩
뽑는다. 아카이브를 통째로 메모리에 올리지 않는다 — 여는 데는 끝부분과 중앙
디렉터리만, 한 장을 뽑는 데는 그 엔트리의 로컬 헤더와 바이트만 읽는다. 그대로
저장된 엔트리(method 0)는 잘라 쓰고, deflate 된 엔트리(method 8)는 플랫폼의
`DecompressionStream`으로 푼다. 그 밖의 방식은 이름을 대며 거절한다.

데이터가 시작하는 자리는 **로컬 헤더**에서 읽는다. 중앙 디렉터리에는 로컬 헤더의
extra 길이가 없고, 두 헤더의 extra는 흔히 다르다.

EOCD는 뒤에서부터 찾으므로 주석이 붙은 아카이브도 열린다. ZIP이 아닌 바이트는
빈 아카이브가 아니라 실패다.
✅ zip "every entry is listed in the order the directory wrote them", "an entry carries the
sizes and the method the directory recorded", "a trailing comment does not hide the
directory", "an empty archive opens with nothing in it", "bytes that are not a ZIP fail
rather than opening empty", "opening reads the directory, not the pages", "a stored entry
comes back byte for byte", "a deflated entry comes back unpacked", "each entry reads its
own bytes, not its neighbour’s", "the local header decides where the data starts, not the
directory", "pulling one entry out reads that entry and nothing else", "an entry that runs
past the end of the archive fails rather than coming back short", "a method this reader
does not know is refused by name"
⚠️ zip64도, 암호 걸린 아카이브도, rar·7z·lzh도 읽지 않는다

### 2.2 페이지 넘기기

**R-211 · Next / Previous / First / Last**
✅ reader/screen "a key turns the page",
chrome/screen 'the footer turns the page and names its slider "Page"'

**R-212 · 책 끝에서 무엇을 할지는 설정이 정한다**
`atBookEnd`가 셋 중 하나다. `next`(기본)는 이웃한 책으로 이어 읽고(`R-216`),
`wrap`은 같은 책의 반대쪽 끝으로 돌아가며, `stop`은 제자리에 머문다.
✅ reader/story "previous on the first page stays put",
"set to wrap, the end of the book leads back to its start"

**R-213 · 카운터는 현재 스프레드를 보여준다**
한 장이면 `3 / 120`, 두 장이면 `4–5 / 120`.
✅ chrome/screen "the counter and the file name sit above the reader"

**R-217 · 카운터 아래에 지금 걸린 파일 이름이 붙는다**
아카이브 안에서의 이름이고, 폴더는 떼어 낸 것이다. 두 장이 걸리면 읽는 순서대로 둘
다 보인다.

긴 이름은 **앞을** 줄인다. 스캔본의 이름은 대개 `Vol.01 Ch.003 - 045.jpg`처럼 공통된
머리에 번호가 붙는 꼴이라, 뒤를 자르면 페이지마다 똑같은 머리만 남는다. 통째로는
`title` 속성에 남는다.

번호만으로는 정렬이 어긋난 것을 알아볼 수 없다. 아카이브는 이름순으로 서는데 그
이름이 사람의 기대와 다른 책이 있고, 그때 몇 번째 장인지가 아니라 어느 파일인지가
단서가 된다. 메뉴바와 같은 줄에 있으므로 숨기면(`R-252`) 함께 빠진다.
✅ chrome/screen "the counter and the file name sit above the reader",
e2e "R-217 · 카운터 아래에 아카이브 안의 파일 이름이 보인다", "R-217 · 두 장이 걸리면
이름도 둘이다"
📖 긴 이름의 앞을 줄이는 것은 CSS가 한다 — 재는 테스트가 없다

**R-218 · 카운터 옆에 지금 걸린 값이 적힌다**
읽는 방향(`RTL`/`LTR`), 한 장인지 두 장인지(`One`/`Two`), 맞춤 모드
(`Fit`/`Width`/`Height`/`1:1`), 그리고 돌고 있을 때만 `Playing`이다. 멈춘 슬라이드쇼는
적지 않는다 — 언제나 서 있는 글자는 읽히지 않고 줄만 길게 만든다.

컨트롤이 메뉴 안으로 들어가면서(`R-251` 위의 머리말) 지금 값도 함께 접혔다. 그것을 도로 꺼내 놓는
자리다. 메뉴 안의 곁글과 달리 `aria-hidden`이 아니므로 보조기기도 읽는다. 값을 바꾸는
항목은 눌리는 순간 메뉴와 함께 사라지므로, 무엇으로 바뀌었는지 말해 줄 자리가 이 줄
말고는 없다 — 그래서 `role="status"`다.
✅ chrome/screen "the header says which way it reads, how many pages and how they fit",
"and it says so too while the slideshow runs", "the values stand beside the counter, and the
counter still comes first"

**R-214 · 이미 지나간 페이지의 이미지가 늦게 도착하면 버린다**
✅ pages "land on their own spread and leave the one on screen alone",
reader/screen "a stale answer does not replace the page on screen"

**R-215 · 앞뒤 스프레드를 미리 읽고, 멀어진 페이지는 해제한다**
양쪽 1스프레드를 미리 읽고 3스프레드 밖은 해제한다. 미리 읽는 것은 압축을 푸는
데서 끝나지 않고 디코딩까지 해 둔다 — 넘겼을 때 곧바로 그려지는 것이 미리 읽어
두는 이유이므로, 압축만 풀어 두면 절반만 한 셈이다.

미리 읽는 범위와 놓지 않는 범위가 다른 것은 둘이 다른 일을 하기 때문이다. 앞의 것은
새로 뽑을 것을 정하므로 좁고, 뒤의 것은 이미 뽑아 둔 것을 언제 버릴지 정하므로 넓다.
그래서 3스프레드 안이어도 한 번도 미리 읽은 적 없는 페이지는 뽑지 않는다 — 책을 여는
순간 일곱 스프레드가 한꺼번에 풀리는 일이 없다.
✅ reader/screen "pages within three spreads keep their URLs, and the ones beyond let them
go"
🔍 (2026-09-12, `R-206`과 같이 쟀다)

**R-206 · 페이지는 그릴 수 있게 된 뒤에 걸린다**
디코딩은 object URL을 만드는 것과 별개의 일이다. URL이 생기자마자 `<img>`를
세우면 상태 줄은 이미 "Loading…"을 거두었는데 페이지는 아직 그려지지 않은 빈
구간이 생긴다. 그래서 `LoadSpread`가 디코딩을 기다린 뒤에 스프레드를 내놓는다.

끝내 디코딩되지 않는 페이지가 리더를 붙잡아서는 안 되므로 5초에서 놓아 준다.
그때는 `<img>`가 제 속도로 그린다.

브라우저에서만 드러나고, 합성 픽스처로는 재현되지 않는다 — 단색 PNG는 너무 빨리
디코딩된다. 실제 아카이브(2061×2880 webp 29장)를 여덟 번 넘기며 `<img>`가 서
있는데 `naturalWidth`가 0인 프레임을 셌다.

|                  | 빈 프레임 | 여덟 번 넘김   |
| ---------------- | --------- | -------------- |
| 기다리지 않을 때 | 5, 5, 5   | 618·638·644 ms |
| 기다릴 때        | 0, 0, 0   | 591·580·626 ms |

기다리는 쪽이 느리지 않다. 이웃을 미리 디코딩해 두므로(`R-215`) 넘기는 순간에는
할 일이 남아 있지 않다.
🔍 (2026-09-12)

**R-207 · 다음 페이지가 그릴 수 있게 될 때까지 이전 페이지가 화면에 남는다**
넘기는 순간 화면을 비우지 않는다. `R-206`이 디코딩을 기다리는 동안 스테이지에는
넘기기 직전의 스프레드가 그대로 걸려 있고, 새 스프레드가 준비되면 한 번에 바뀐다.
그 페이지들의 URL도 새 스프레드가 설 때까지 놓지 않는다(`R-215`의 해제 범위 밖이어도).

남아 있는 페이지는 그것을 그릴 때의 `entry`, 반쪽, 배율과 이동으로 그린다. 넘기는
순간 Model은 이미 다음 페이지의 값을 쥐고 있어서, 그것으로 그리면 이전 페이지가 끝에
붙거나 반쪽이 바뀌거나 확대가 풀려 한 번 튄다. 답이 오기 전에 다시 넘겨도 화면에
걸린 것이 남는다.

기다리는 동안 휠로 굴려도 페이지를 옮기지 않는다(`R-240`). 화면에서 잰 남은 거리는
남아 있는 이전 페이지의 것이라, 확대해 둔 이전 페이지의 거리로 굴리면 확대하지 않은
다음 페이지가 엉뚱한 자리에 앉는다. 그동안은 갈 곳이 없는 것으로 쳐서, 마우스 휠은
한 장 더 넘기고 트랙패드는 멈춘다.

늦을 때만 스테이지 모서리에 "Loading…"(`role="status"`)이 선다. 나타나는 것은
CSS가 300ms 미루므로, 미리 읽어 둔 이웃으로 넘길 때는 보일 일이 없다. 책을 막 열어
남길 페이지가 없을 때는 지금처럼 곧바로 "Loading…"이다.

캔버스로 옮기지 않은 이유 — 깜빡임은 `<img>`가 아니라 넘기는 순간 화면을 비우던
상태 전이에서 왔다. 3200×4800 페이지 여덟 장으로 Last·First로 건너뛰고 빠르게
네 번 넘기는 동안, 페이지 상자에 이미지가 없는 프레임을 셌다.

|            | 빈 프레임 |
| ---------- | --------- |
| 비우던 때  | 14, 21    |
| 남겨 둘 때 | 0         |

✅ reader/story "handed no room at all, a scroll neither pans nor turns",
reader/screen "the page on screen stays until the next one can be drawn", "a zoomed page
keeps its zoom while the next one is on its way", "it keeps what it drew with, not what the
next page will use", "a scroll before it arrives does not move the page on its way", "a
zoomed page that is on screen does scroll",
e2e "R-207 · 멀리 건너뛰어도, 빠르게 넘겨도 화면이 비는 프레임이 없다", "R-207 · 확대해
둔 페이지는 다음 페이지가 설 때까지 확대된 채 남는다"
📖 늦을 때만 스테이지 모서리에 서는 "Loading…" — 재는 테스트가 없다
⚠️ 기다리는 동안 핀치나 −/+로 배율을 바꾸면 그 값은 다음 페이지에 걸린다. 남아 있는
이전 페이지는 움직이지 않다가, 다음 페이지가 서면서 바뀐 배율이 드러난다.

**R-216 · 책의 끝을 넘기면 이웃한 책이 그 자리에서 열린다**
마지막 장에서 계속 넘기면 책장 순서상 다음 책이, 첫 장에서 뒤로 넘기면 앞 책이
열린다. 책장으로 돌아갈 필요가 없다. 이웃한 책은 책장에서 열 때와 똑같이 저장된
위치에서 시작한다(`N-403`).

책장의 끝에서는 아무 일도 일어나지 않고 제자리에 머문다. 이웃을 묻는 일은 그때마다
저장소를 읽는 것이라(`P-301`), 책장을 한 번도 거치지 않고 주소로 곧장 리더에 들어온
사람도 이웃 책으로 넘어간다. 저장소가 답하지 못했을 때만 제자리다.

책 사이를 오가는 별도의 버튼은 없다. 원본 뷰어에서도 책의 끝을 넘기는 동작이 곧
다음 권을 여는 동작이었고, 따로 만들면 두 기능이 겹친다.
✅ book "a step forward lands on the next book in shelf order", "the shelf does not
wrap around at either end",
state/shelf "a shelf that cannot be read leaves the reader where it is",
reader/story "turning past the last page asks for the book after this one",
"turning back from the first page asks for the book before this one",
reader/screen "turning past the last page opens the book after this one",
e2e "R-216 · 마지막 장에서 넘기면 다음 권이 열린다", "R-216 · 첫 장에서 뒤로 넘기면
앞 권으로 돌아간다", "R-216 · 책장의 끝에서는 제자리에 머문다"
⚠️ 읽는 순서는 책장 순서 그대로다. 책장은 최근에 들여온 것이 앞이므로(`S-102`),
한 권씩 따로 들여오면 순서가 뒤집힌다. 한 번에 들여오면 제목순으로 선다.

### 2.3 레이아웃

**R-221 · 읽는 방향 (RTL / LTR)**
보기 메뉴의 항목이 뒤집고, 지금 어느 쪽인지는 헤더의 상태 줄이 말한다(`R-218`). 두 장
배치에서 페이지 좌우 순서와 탭·스와이프·화살표의 앞뒤가 함께 바뀐다.
✅ chrome/screen "the view menu carries every control that changes how a page is shown",
"the header says which way it reads, how many pages and how they fit",
reader/story "in right-to-left reading the left key advances"
❓ **실제로 만화를 넘겨봤을 때 방향이 맞는지**

**R-222 · 한 장 / 두 장 (One / Two)**
두 장 모드에서도 지금 읽던 페이지를 중심으로 다시 묶는다. 지금 어느 쪽인지는 헤더의
상태 줄이 말한다(`R-218`).
✅ reader/story "two-page mode regroups around the page being read",
chrome/screen "the header says which way it reads, how many pages and how they fit"

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

지금 어느 모드인지는 헤더의 상태 줄이 말한다(`R-218`). 메뉴 항목의 이름은 늘
"Change how pages are fitted"이고, 지금 값은 그 곁글에 적힌다.
✅ reader/story "cycling the fit mode walks the four modes and comes back",
chrome/screen "the view menu carries every control that changes how a page is shown",
"the header says which way it reads, how many pages and how they fit",
e2e "R-224 · Fit은 페이지를 화면 안에 통째로 넣는다", "R-224 · Width는 너비를
채운다", "R-224 · Height는 높이를 채운다", "R-224 · 1:1은 원래 픽셀 크기로 둔다",
"R-224 · 통째로 맞춤은 켜 두어도 작은 페이지를 늘리지 않는다"
📖 메뉴 항목 옆에 지금 걸린 모드가 적히는 것 — 재는 테스트가 없다

**R-225 · 바꾼 설정은 저장되고 다음 책에도 적용된다**
✅ state/settings "what was written is what a later session reads",
e2e "P-303 · 설정은 남고 다음 책에도 적용된다"

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
두 장 모드에서 보기 메뉴의 `Flip how this spread is paired`와 `s` 키가 지금 보고 있는
스프레드의 묶기를 뒤집는다.
두 장이 보이고 있으면 앞 장을 혼자 세우고, 한 장만 보이고 있으면 다음 장과 묶는다.
같은 자리에서 두 번 누르면 처음 보던 묶음으로 돌아온다.

손으로 건 표시는 `R-226`의 자동 판정을 이긴다. 그러지 못하면 탈출구가 아니다.
표시는 읽던 자리·북마크와 같은 자리에 책마다 저장된다(`P-302`). 한 장 모드에는
뒤집을 묶기가 없어서 항목도 서지 않는다.
✅ spreads "a page told to stand alone does, however narrow it is", "a page told to
pair does, however wide it is", "a page bound to the next one wins over the cover
rule",
reader/story "flipping the binding splits the spread being read, and saves it",
"flipping twice comes back to the spread it started from", "flipping binds a wide
page back to its neighbour", "one-page mode has no binding to flip",
chrome/screen "a single-page view has no binding to flip",
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
e2e "R-229 · 넓은 페이지가 두 걸음으로 나뉜다", "R-229 · 뒤로 넘겨 오면 나중에 읽는
반쪽이 나온다", "R-229 · 반쪽은 화면 안에 통째로 들어간다"

⚠️ 카운터는 반쪽을 세지 않는다. 두 걸음 모두 같은 페이지 번호다.

**R-228 · 보기 메뉴의 `Turn the page a quarter clockwise`와 `r` 키가 페이지를 세운다**
한 번에 90도씩, 네 번이면 제자리다. 눕혀 스캔된 책을 바로 세우는 자리다.

세운 페이지에도 맞춤 모드가 화면 크기대로 걸린다. 페이지를 담은 상자가 함께 눕기
때문이다 — 90도나 270도로 돌린 상자는 화면의 높이만큼 넓고 화면의 너비만큼 높다
(`100cqh`·`100cqw`). 상자를 그대로 둔 채 돌리기만 하면 세운 페이지가 화면의 절반도
쓰지 못한다. 굴릴 수 있는 거리(`R-240`)는 그 눕힌 상자가 아니라 화면을 기준으로 잰다.

각도는 읽는 사람의 습관이 아니라 그 책이 어떻게 스캔되었는지를 적는 것이다. 그래서
설정이 아니라 묶기 교정과 같이 책마다 저장된다(`P-302`). 기억하기 스위치(`R-2B3`)와
무관하게 언제나 남는다.
✅ rotation "four turns come back around", "a quarter turn swaps the sides of the box, a
half turn does not",
reader/story "rotating reports the new angle with the position", "rotating leaves the
page and the zoom where they were", "a book opens at the angle it was left at",
reader/screen "rotating stands the page in a box that swapped its sides",
e2e "R-228 · 세운 페이지는 눕힌 상자에 맞춰진다", "R-228 · 네 번 세우면 제자리로
돌아온다", "R-228 · 세워 둔 각도는 그 책에 남는다", "R-228 · 화면에 다 들어가는 세운
페이지는 굴려도 밀리지 않는다"

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
"a settings change keeps the zoom, because the page did not move",
e2e "R-239 · 페이지를 넘기면 줌이 처음으로 돌아온다"

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

**2px 이하의 여유는 없는 것으로 친다.** 화면에 통째로 들어간 페이지가 제 상자보다
소수점 몇 자리만큼 넘치는 일이 흔한데, 그 조각을 "갈 곳"으로 세면 굴림 한 칸이 거기에
먹히고 위의 "한 번 굴리면 넘어간다"가 간헐적으로 어긋난다. 갈 곳을 재는 쪽과 끝에
닿았는지 보는 쪽이 같은 눈금을 쓴다.

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
reader/screen "it keeps what it drew with, not what the next page will use",
e2e "R-247 · 앞으로 넘겨 온 긴 페이지는 첫 줄부터 보인다", "R-247 · 뒤로 넘겨 온 긴
페이지는 끝에서 시작한다"

**R-237 · 가운데를 두 번 탭하면 2.5배, 다시 두 번 탭하면 원래대로**
300ms 안의 두 탭이 한 쌍이고, 세 번째 탭은 방금 한 줌을 되돌리지 않고 새 쌍을
연다. **가운데에서만** 성립한다 — 바깥 1/3은 페이지 넘김 전용이라, 빠르게 두 번
탭하면 두 장이 넘어간다. 빨리 읽는 것과 확대 요청은 다른 일이다.
✅ reader/story "two quick taps in the middle still zoom",
"two quick taps on a turning zone turn two pages",
"a turning tap does not pair with a middle tap that follows",
"a double tap zooms in, and the next pair zooms back out", "a first middle tap
moments after the page opens shows the chrome, not a zoom"

**R-238 · 보기 메뉴의 `Zoom in`/`Zoom out`으로도 확대·축소**
화면 중앙을 기준으로 1.25배씩. 배치를 바꾸는 것이 아니라 같은 이미지를 늘리는
것이라, 눌러도 페이지를 다시 뽑지 않는다. 축소는 원래 크기에서 멈춘다(`R-231`).
✅ chrome/screen "the view menu carries every control that changes how a page is shown",
reader/screen "a zoomed page keeps its zoom while the next one is on its way",
gesture "zoom is held between one and the maximum"

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
않는다(메뉴바가 이미 답이다).
✅ reader/story "a tap that turns the page marks the side it came from",
"a tap at the end of the book marks nothing",
"a tap in the middle marks nothing either",
"tapping the same side again restarts the mark"
❓ **브라우저 확인 필요** — 260ms 페이드가 실제로 읽히는지
⚠️ 프로덕션 빌드에서는 그리지 않는다. 넘어간 사실은 Model에 기록되지만 화면에
나타나지 않으므로, 배포된 앱에서는 여전히 "같은 그림이 움직였다"로 읽힐 수 있다.

**R-242 · 가운데를 탭하면 메뉴바가 숨거나 나타난다**
숨어 있으면 나타나고, 나타나 있으면 숨는다. 화면을 누르는 것 자체는 메뉴바를
부르지 않는다 — 그랬다면 가운데 탭이 언제나 숨김으로 끝난다.
✅ reader/story "a tap in the middle toggles the chrome and stays on the page",
"a middle tap brings hidden chrome back",
"a press leaves the chrome as it found it"

**R-243 · 옆으로 45px 넘게 끌면 페이지가 넘어간다**
왼쪽으로 끌면 오른쪽 페이지를 부른다.
페이지 이미지는 끌 수 없게 해 두었다. 그러지 않으면 브라우저가 이미지 드래그를
시작하면서 포인터 이벤트를 거두어 가고, 스와이프가 첫 움직임 뒤에 잘린다.
✅ gesture "dragging leftwards asks for the page on the right",
reader/story "dragging leftwards asks for the right-hand page",
e2e "R-243 · 옆으로 끌면 그 반대쪽 페이지를 부른다"

**R-244 · 10px 이내의 움직임은 탭으로 친다**
✅ gesture "a short drag is not a swipe",
e2e "R-244 · 10px 이내로 움직인 누름은 탭으로 친다"

### 2.6 메뉴바 보이기와 숨기기

리더의 위쪽 줄은 버튼이 늘어선 툴바가 아니라 메뉴바다(`role="menubar"`, 이름 "Reader
menus"). `Book`·`View`·`Go`·`Play`·`Settings` 다섯 메뉴 안에 예전 툴바의 컨트롤이 그대로
들어 있고, 이름도 그대로다. 트리거의 이름도 앱의 다른 모든 문구와 같이 영어다.
메뉴 안으로 접히면서 보이지 않게 된 지금 값들은 헤더의 상태 줄이 대신 말한다(`R-218`). 메뉴 항목은 `menuitem`이며, 상태를 지는 넷 — 북마크(`Bookmark this
page`/`Remove bookmark from this page`), 격자(`Show every page`), 설정(`Reading
settings`), 슬라이드쇼 — 은 `menuitemcheckbox`라 `aria-checked`를 진다. 그중 패널을
여는 둘(격자·설정)은 `aria-expanded`도 함께 진다. `Hide the toolbar`는 상태가 아니라
명령이므로 평범한 `menuitem`이다.

넘김 줄(First·Previous·Next·Last)과 번호 입력란과 슬라이더는 메뉴에 접지 않고 푸터에
그대로 남는다. 읽는 동안 손이 계속 가는 것들이다.
✅ chrome/screen "the book menu carries the shelf, the bookmark and the page grid", "the
view menu carries every control that changes how a page is shown", "the go menu steps
through bookmarks and sends focus to the page box", "the play menu starts the slideshow and
the settings menu opens the panel", "left and right arrows walk the menubar", "Enter opens a
menu and Escape closes it again", "an open menu hands the arrow keys to its neighbour",
"every item shows the key that does the same thing", "hiding the toolbar is a command, not a
state"

**R-251 · 메뉴바는 스스로 숨지 않는다**
책을 열면 메뉴바와 푸터가 떠 있고, 사람이 숨기기 전까지 그대로 있다. 페이지를 넘기거나
컨트롤을 쓰는 것은 메뉴바를 건드리지 않는다 — 떠 있으면 떠 있고, 숨어 있으면 숨어 있다.

예전에는 3초 동안 아무 일도 없으면 흐려졌고, 키를 누르면 다시 나왔다. 키보드로 읽는
사람에게는 넘길 때마다 위쪽 줄이 나타났다 사라지기를 되풀이하는 셈이라 도리어
피곤했다. 흐려진 줄은 자리를 그대로 차지해서, 숨겨도 읽을 자리가 넓어지지도 않았다.
✅ reader/story "the chrome stays up while nothing happens", "turning the page leaves
hidden chrome hidden", "using a control leaves the chrome where it is",
e2e "R-251 · 가만히 두어도 툴바가 사라지지 않는다"

**R-252 · 보기 메뉴의 `Hide the toolbar`, `h` 키, 가운데 탭이 메뉴바를 숨기거나 되부른다**
숨긴 메뉴바와 푸터는 흐려지는 것이 아니라 화면에서 빠지고, 스테이지가 그 높이를
가져간다. 전체화면(`R-291`)과 함께 쓰면 화면에는 페이지만 남는다.

`Hide the toolbar`는 메뉴바 안에 있으므로 숨길 때만 쓸 수 있다. 되부르는 길은 `h` 키와
가운데 탭(`R-242`)이다. 숨긴 메뉴바는 탭 순서에서도 빠지므로, 키보드로 읽는 사람에게는
`h`가 그 길이다. 이 항목은 상태가 아니라 명령이라 `aria-checked`를 지지 않는다.

숨긴 상태는 저장하지 않는다. 책을 새로 열면 메뉴바는 다시 떠 있다.
✅ reader/story "the hide control takes the chrome down and brings it back", "the h key
does what the hide control does", "a middle tap brings hidden chrome back",
reader/screen "the toolbar hides and the stage takes the height",
chrome/screen "a hidden chrome leaves neither bar behind", "hiding the toolbar is a command,
not a state",
keys `"h" is the same thing the ClickedToggleChrome control does`,
e2e "R-252 · `h` 키가 툴바를 숨기면 스테이지가 그 높이를 가져가고, 다시 누르면
돌아온다", "R-252 · `Hide` 버튼으로 숨긴 툴바는 가운데 탭으로 돌아온다"

### 2.7 페이지 슬라이더

**R-261 · 슬라이더가 현재 위치를 보여주고 옮긴다**
`aria-valuenow`가 트랙 위의 자리, `aria-valuetext`가 페이지 번호, 이름은 "Page".
✅ chrome/screen "reading left to right, it runs the usual way",
'the footer turns the page and names its slider "Page"'

**R-262 · 범위는 책을 연 순간 쪽수에 맞춰진다**
✅ chrome/screen "reading left to right, it runs the usual way"

**R-263 · 키보드로도 움직인다**
화살표, PageUp/Down, Home/End.

끄는 도중의 Escape는 손잡이를 잡기 전 자리로 되돌린다. 손잡이를 잘못 집어 읽던 자리를
잃는 일을 이 한 키가 무른다. 끌지 않는 중의 Escape는 리더의 것이라 그대로 흘려보낸다
(`R-2A3`).
✅ chrome/screen "the slider moves by step, by page and to either end", "Escape during a
drag puts the slider back where the drag began", "and an Escape with no drag to undo is left
to the reader"
❓ 드래그로 스크럽하는 감각

**R-264 · 오른쪽에서 왼쪽으로 읽으면 슬라이더도 뒤집힌다**
첫 페이지가 오른쪽 끝이고, 읽을수록 thumb이 왼쪽으로 간다. 채워진 구간은 읽은
만큼이므로 오른쪽 끝에서 thumb까지다 — 컴포넌트는 늘 자기 최솟값(왼쪽)부터
채우기 때문에, 이 방향에서는 트랙과 채움의 색이 자리를 바꾼다. 푸터의 버튼
순서도 함께 뒤집힌다. 페이지 번호는 뒤집히지 않으므로 `aria-valuetext`는 그대로
1부터 센다.
✅ chrome/screen "reading right to left, the slider starts full and empties
leftward", "reading right to left, the filled part of the track sits on the
right", "reading left to right, the fill is the fill", "the row of controls
turns around with the reading direction", "and reading left to right it stays
as written", "reading right to left, the slider keys follow what the eye sees"
🔍 2026-09-09 · 만화를 넘겨보며 채워지는 쪽과 줄어드는 쪽을 확인함

**R-265 · 키를 스스로 쓰는 위젯 위에서는 리더가 키를 양보한다**
리더의 키 구독은 문서에 걸려 있어 언제나 맨 나중에 본다. 양보하지 않으면 한 번 누른
키가 두 번 세어진다 — 같은 방향 두 페이지(LTR)이거나 서로 밀어내기(RTL).

양보하는 자리는 셋이다. **슬라이더**는 화살표·Home/End·PageUp/Down을 스스로 처리하고,
**번호 입력란**(`R-266`)에서는 화살표와 Space가 글자를 옮기는 키이며, **메뉴바**는
화살표로 항목 사이를 걷고 아래 화살표와 Space로 열리고 글자 하나로 항목을 찾는다.
메뉴가 열려 있는 동안 `h`나 `t` 같은 글자까지 메뉴의 키다.

물러나는 관문이 둘인 것은 둘이 서로 다른 것을 덮기 때문이다. 하나는 포커스가 어느
역할 위에 있는지를 보므로 위젯이 조용히 삼키는 키 — 메뉴의 타입어헤드 같은, `preventDefault`를
부르지 않는 것 — 까지 덮지만 덮을 역할의 목록을 손으로 적어 두어야 한다. 다른 하나는
목록 없이 "이미 누가 가져갔다"만 보므로, 여기 적히지 않은 위젯이 나중에 생겨도 리더가
겹쳐 반응하지 않는다.
✅ keys "the elements the reader yields its keys to" — 여섯 역할(`slider`, `menubar`,
`menu`, `menuitem`, `menuitemcheckbox`, `menuitemradio`)마다 한 개씩 도는 테스트와,
"a key pressed while typing a page number is the box’s", "a key pressed inside a menu item
still belongs to the menu", "a key pressed on an ordinary button is the reader’s",
reader/subscription "a key pressed on the page itself turns it", "a key pressed on a menu
trigger is not the reader’s", "a key someone has already taken is not the reader’s",
chrome/screen "the slider moves by step, by page and to either end", "reading right to
left, the slider keys follow what the eye sees",
reader/screen "walking the menubar with an arrow key does not turn the page",
e2e "R-266 · 번호를 적는 동안 화살표는 페이지를 넘기지 않는다"
🔍 2026-09-09 · 슬라이더에 포커스를 준 뒤 화살표가 한 번에 한 페이지만 넘기는 것을
확인함

**R-266 · 번호를 적어 그 페이지로 간다**
슬라이더 옆의 입력란. Enter를 누르거나 입력란을 떠나면 그 번호로 간다. 책 밖의
번호나 숫자가 아닌 것은 아무 일도 일으키지 않는다 — 잘못 적은 것을 되돌릴 자리가
입력란 자신이다.

적은 값을 Model에 두지 않는다. 적는 동안 리더가 그것을 고쳐 쓰면 손가락과 싸우게
되고, 필요한 것은 다 적은 뒤의 한 번뿐이다. 지금 어디인지는 자리표시자가 말해 준다.

적는 동안에는 리더가 키를 양보한다(`R-265`와 같은 이유). 화살표와 Space는 글자를
옮기는 키이지 페이지를 넘기는 키가 아니다.
✅ reader/story "a number in the book goes there", "a number outside the book, or no
number at all, changes nothing",
chrome/screen "a number in the box goes there when Enter is pressed",
e2e "R-266 · 번호를 적고 Enter를 누르면 그 페이지로 간다", "R-266 · 번호를 적는 동안
화살표는 페이지를 넘기지 않는다"

⚠️ 퍼센트로 가는 길은 없다. 슬라이더가 이미 비율로 잡는 자리다.

### 2.8 모든 페이지 (썸네일)

**R-271 · 책 메뉴의 `Show every page`가 전체 페이지 그리드를 연다**
리더 위에 덮이는 패널(`dialog`, 이름 "Every page"). 그 항목은 `menuitemcheckbox`라
격자가 열려 있는 동안 `aria-checked`와 `aria-expanded`가 참이다.
✅ reader/screen "escape closes one layer at a time",
thumbs/screen "closing the grid is asked of the parent",
chrome/screen "the book menu carries the shelf, the bookmark and the page grid", "a
bookmarked page, an open grid and an open panel all say so on their row"

**R-272 · 화면에 보일 만큼만 추출한다**
스크롤 위치에서 창을 계산해 그 주변 2행까지만 읽는다. 500쪽 책이 500장을 풀지 않는다.
✅ thumbs/screen "a long book stands only the rows around the window, not all of it",
e2e "R-272 · 패널을 여는 순간 썸네일이 채워진다"

**R-273 · 썸네일을 고르면 그 페이지로 가고 패널이 닫힌다**
✅ thumbs/screen "picking a page from the grid reports it",
reader/story "picking a thumbnail jumps there and closes the grid"

**R-274 · 페이지를 넘겨도 그리드가 비지 않는다**
그리드가 보여주는 페이지는 해제 대상에서 빠진다. 격자의 칸마다 그 페이지의 atom을
쥐고 있으므로, 리더가 놓아도 격자가 쥐고 있는 동안에는 URL이 살아 있다.
📖 격자를 두고 넘기는 자리를 재는 테스트는 없다. 쥔 쪽이 하나 놓아도 URL이 남는다는
것까지는 pages "a page still on screen keeps its URL when a neighbour sharing it lets go"가
잰다

**R-275 · 북마크된 페이지는 그리드에서 테두리로 구분된다**
북마크된 칸은 강조색 테두리를 두르고, 나머지는 테두리가 없다.
✅ thumbs/screen "a bookmarked page is marked out from the rest in the grid"

**R-276 · 격자가 창 너비를 따라간다**
잰 너비 하나에서 셋이 갈라져 나온다 — 한 행에 설 칸의 수, 칸의 너비, 행의 높이다.
따로 두면 어긋난 채로 그려지고, 그러면 보이지 않는 썸네일을 뽑거나 보이는 자리를
비워 둔다.

먼저 104px를 최소로 삼아 몇 칸이 들어가는지 센다. 그 다음 남는 자리를 그 칸들이
고르게 나눠 가지므로 행은 폭을 남김없이 쓴다. 행의 높이는 칸의 너비를 따라간다 —
인쇄된 만화 한 쪽의 비(1.5)에 페이지 번호가 설 24px을 더한 것이다.

그래서 칸은 104px과 그 두 배 사이에 머문다. 그보다 넓어지면 한 칸이 더 들어갔어야
한다. 넓은 창이 늘 큰 썸네일을 주지는 않는다 — 좁은 창은 열이 적어서 오히려 칸이
크다. 아무리 좁아도 두 칸은 세운다. 한 칸씩 늘어서면 격자가 아니라 목록이다.

너비는 격자를 열 때 한 번 재고, 열려 있는 동안 창이 바뀌면 다시 잰다. 가상 리스트는
높이만 재어 주므로 너비는 `MeasureThumbsWidth`가 묻는다. 잰 뒤에는 리스트가 쥔
`rowHeightPx`에도 새 값을 먹인다 — 리스트는 행의 자리를 그 값으로 셈하므로, 그리는
높이와 어긋나면 행이 겹치거나 벌어진다.
✅ thumbs "a wider window stands more of them", "however narrow, the grid never falls to a
single column", "the columns fill the row they stand in", "a column never gets narrower
than the width that decided the count", "a wider window makes the thumbnails bigger, not
just more of them", "a row is as tall as its columns are wide, with room for the number",
"a column stays between one column wide and two",
thumbs/screen "the row stands as many columns as the measured width allows",
e2e "R-276 · 넓은 창에는 더 많은 칸이 선다", "R-276 · 격자가 한쪽으로 몰리지 않는다",
"R-276 · 칸이 넓어지면 행도 그만큼 높아진다", "R-276 · 좁은 창에서도 격자는 격자로
남는다"

### 2.9 북마크

**R-281 · 책 메뉴의 북마크 항목이 현재 페이지를 북마크한다**
이름이 지금 상태를 말한다 — 북마크가 없으면 "Bookmark this page", 있으면 "Remove
bookmark from this page"다. `menuitemcheckbox`라 `aria-checked`가 상태를 반영한다.
✅ chrome/screen "the book menu carries the shelf, the bookmark and the page grid", "a
bookmarked page offers to take the bookmark away instead", "a bookmarked page, an open grid
and an open panel all say so on their row", "a page with no bookmark leaves its row
unchecked"

**R-282 · 북마크는 페이지 순서를 유지한다**
✅ reader/story "bookmarks stay in page order however they were added"

**R-283 · 북마크는 읽던 위치와 같이 저장된다**
✅ reader/story "bookmarking a page reports the new set, and unbookmarking removes it"

**R-284 · 그리드를 북마크만으로 좁힌 것이 북마크 목록이다**
그리드 머리의 "Show bookmarks only" 버튼이 늘어놓을 페이지를 북마크된 것으로 바꾸고,
그때 이름은 "Show all pages"가 된다. 좁혀 놓으면 패널의 이름도 "Every page"에서
"Bookmarks"로 바뀐다. 목록을 따로 만들지 않고 이미 있는 격자를 좁힌다 — 썸네일도
창(window) 처리도 그대로 쓴다. 아무것도 북마크하지 않은 책은 빈 격자 대신 그렇다고
말한다.
✅ thumbs "filtered to bookmarks, only those pages",
thumbs/screen "the grid can be narrowed to what is bookmarked", "a book with nothing
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

**R-286 · 목록에서 북마크를 바로 지운다**
북마크 목록의 칸마다 ✕가 하나 붙는다. 이름은 "Remove the bookmark on page 3"이고,
누르면 그 북마크만 빠진다 — 그 페이지로 가지 않으므로 읽던 자리는 그대로다. 책
전체를 보는 중에는 이 버튼이 없다. 대부분의 칸에 지울 것이 없어서, 있는 칸에만
붙이면 격자가 들쭉날쭉해진다.
✅ reader/story "a bookmark can be dropped from the list without going to its page",
"dropping the bookmark on the page being read leaves the reader there",
thumbs/screen "each entry in the bookmark list drops its own bookmark, and the grid has
none to drop", "the whole grid offers no way to drop a bookmark, only the list does",
e2e "R-286 · 목록에서 북마크를 바로 지우고, 그것이 새로고침을 넘긴다"

### 2.10 전체화면

**R-291 · 보기 메뉴의 `Enter fullscreen`/`Leave fullscreen`이 전체화면을 오간다**
이름이 지금 상태를 말하므로 항목은 상태를 지지 않는 평범한 `menuitem`이다.
✅ reader/story "the control asks, and the document reports what happened",
chrome/screen "fullscreen and the slideshow say how to leave once they are on",
e2e "R-291 · Full 버튼이 전체화면을 오간다"

**R-292 · 브라우저가 거절하거나 사용자가 브라우저 방식으로 나가도 상태가 맞는다**
Model을 움직이는 것은 요청이 아니라 `fullscreenchange` 이벤트다.
✅ reader/story "leaving fullscreen outside the app is still noticed",
e2e "R-292 · 브라우저 쪽에서 나가도 상태가 맞는다"

### 2.11 설정 패널

**R-2B1 · 설정 메뉴의 `Reading settings`와 `,` 키가 읽기 설정 패널을 연다**
그 항목은 `menuitemcheckbox`라 패널이 열려 있는 동안 `aria-checked`와 `aria-expanded`가
참이다. 메뉴에 자기 항목이 없던 설정 여섯이 여기 있다 — 표지를 혼자 둘지(`coverAlone`), 넓은
페이지를 가르는 문턱(`singleThreshold`), 넓은 페이지를 반씩 읽을지(`splitWide`), 작은
페이지를 늘릴지(`enlargeToFit`), 슬라이드쇼가 한 장에 머무는 시간(`slideSeconds`),
책의 끝에서 무엇을 할지(`atBookEnd`).

방향·한 장/두 장·맞춤은 여기 없다. 그것들은 읽는 동안 손이 가는 것이라 보기 메뉴에
남고, 여기 있는 셋은 책을 열기 전에 한 번 정하는 것이다.

패널에서 바꾼 것은 곧바로 배치에 반영되고 다른 설정과 같이 저장된다(`P-303`). 같은
패널을 책장에서도 연다(`R-2B6`).

켜고 끄는 항목은 트랙 위를 손잡이가 오가는 스위치다. 패널의 다른 줄은 모두 텍스트
버튼이라, 이 줄만은 모양으로 갈린다. 라벨을 눌러도 토글된다. 설명 문구가 없으므로
스위치는 `aria-describedby`를 달지 않는다 — 없는 요소를 가리키는 참조가 된다.
✅ settings/screen "the settings that have no toolbar button live here", "turning the cover
rule off reports the new settings", "turning on reading wide pages in halves reports it
too", "picking what happens at the end of a book reports it", "the close button hands the
panel back to whoever opened it",
chrome/screen "the play menu starts the slideshow and the settings menu opens the panel", "a
bookmarked page, an open grid and an open panel all say so on their row",
reader/story "a setting picked in the panel lays the book out again at once",
e2e "R-2B1 · ⚙ 버튼이 패널을 열고 닫는다", "R-2B1 · 표지를 혼자 두지 않기로 하면
배치가 바로 바뀌고 새로고침을 넘긴다", "R-2B1 · 책 끝 동작을 고르면 그대로 남는다"
📖 스위치가 `aria-describedby`를 달지 않는 것 — 재는 테스트가 없다

**R-2B2 · 문턱은 0.02씩 움직이고 0.50과 1.00 사이에 머문다**
`−`는 더 많이 묶고 `+`는 더 적게 묶는다. 끝에 닿은 버튼은 `aria-disabled`가 된다.
더한 값은 소수 두 자리에서 끊는다 — 0.02를 거듭 더하면 그러지 않고서는 0.74가
0.7400000000000001이 된다.
✅ reader/story "the threshold stops at the ends of its range",
settings/screen "nudging the threshold moves it one step, not to a long decimal", "the
threshold stops at the ends of its range"

**R-2B3 · 설정을 책마다 기억할 수 있다**
패널의 "Remember these for each book"를 켜면, 그 뒤로 바꾸는 배치가 전역 기본값이
아니라 그 책에 남는다. 책마다 남는 것은 방향·한 장/두 장·맞춤·표지 규칙·넓은 페이지
문턱·반씩 읽기·늘리기다. 테마, 책 끝 동작, 슬라이드쇼 간격, 이어 읽기 방식, 그리고 이
스위치 자신은 읽는 습관이라 전역에 남는다.

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
✅ settings/screen "the settings that have no toolbar button live here",
e2e "R-2B4 · 켜 두면 작은 페이지가 너비를 채운다", "R-2B4 · 끄면 원래 크기를 넘지
않는다", "R-2B4 · 끈 것은 새로고침을 넘긴다"

**R-2B5 · 읽던 자리가 있는 책을 다시 열 때 무엇을 할지 정한다**
패널의 "Opening a book you were part way through". 셋 중 하나다.

| 고른 것      | 무엇이 일어나는가                                     |
| ------------ | ----------------------------------------------------- |
| `Go there`   | 조용히 읽던 자리로 간다. 기본값이다                   |
| `Ask`        | 첫 장을 열어 두고 그리로 갈지 묻는다                  |
| `Start over` | 언제나 첫 장이다. 읽던 자리는 무시할 뿐 지우지 않는다 |

묻는 줄은 답을 받기 전까지 사라지지 않는다. 메뉴바와 함께 숨으면 답할 기회가
없어지고, 첫 장부터 읽기 시작했다고 해서 그 자리가 사라지지도 않는다. 거절하면 첫
장에 머물되 읽던 자리는 남으므로, 다음에 열면 또 묻는다.

첫 장에 멈춰 있던 책은 물을 것이 없다. 이미 그 자리이므로 `Ask`여도 묻지 않는다.

읽는 사람의 습관이라 전역에만 남는다. 원본 뷰어의 `goToLastPageMode`와 같은 자리다.
✅ reading "by default the saved position is taken without asking", "set to start over,
the saved position is ignored rather than forgotten", "set to ask, the book opens at the
start and offers the saved position", "a book left on its first page has nothing to ask
about",
reader/story "taking the offer goes there and the question is done", "turning it down
leaves the reader where it opened", "reading on does not take the question away",
reader/screen "the offer names the page and takes you there",
settings/screen "choosing how a part-read book opens reports it",
e2e "R-2B5 · 기본값은 조용히 읽던 자리로 간다" 외 5개

### 2.12 키보드

**R-2A1 · 페이지 넘기기**
`←`/`→` (읽는 방향을 따름), `↑`/`↓`, `PageUp`/`PageDown`, `Space`(다음),
`Home`/`End`. `Home`/`End`은 방향과 무관하게 책의 첫 장·마지막 장이다.
✅ reader/story "in right-to-left reading the left key advances",
"in left-to-right reading the same key goes back"
📌 슬라이더에 포커스가 있을 때는 R-265에 따라 리더가 물러난다.
📌 `[`/`]`는 앞뒤 북마크로 건너뛴다 (R-285).

**R-2A2 · 토글**
`d` 방향 · `v` 한/두 장 · `s` 묶기 뒤집기 · `r` 세우기 · `p` 슬라이드쇼 · `t` 썸네일 ·
`,` 설정 · `b` 북마크 · `f` 전체화면 · `h` 메뉴바 · `+`/`-` 줌.

키는 같은 일을 하는 메뉴 항목이 보내는 Message로 풀린다. 그래서 키와 항목이 서로
어긋날 수 없다 — 항목의 동작을 고치면 키도 함께 간다. 메뉴는 그 키를 항목 옆에 적어
보여 준다.
✅ keys `"d" is the same thing the ClickedToggleDirection control does` 외 11개,
"Home and End are the ends of the book, whichever way it reads", "the bracket keys are the
bookmarks either side",
chrome/screen "every item shows the key that does the same thing"

**R-2A3 · Escape는 한 겹씩 벗긴다**
설정 → 썸네일 → 슬라이드쇼 → 전체화면 → 책장.
✅ reader/story "escape closes the settings panel before anything else"
✅ reader/story "escape closes the grid before it leaves anything",
"escape then leaves fullscreen before it leaves the book",
"escape with nothing left open goes back to the shelf",
reader/screen "escape closes one layer at a time"

**R-2A4 · 매핑되지 않은 키는 브라우저로 넘어간다**
리더가 쓰는 키만 가져가고 나머지는 건드리지 않는다. Ctrl·Cmd·Alt가 눌린 조합
(Ctrl+R, Cmd+F 등)은 언제나 브라우저 것이다. Shift는 예외로, 리더가 자기 것으로
쓰는 유일한 수정키다(`R-2A5`).
✅ reader/story "an unbound key changes nothing",
keys "a letter it has no use for goes to the browser", "a key held with a modifier is the
browser’s, not the reader’s", "Shift is the one it keeps for itself"

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

### 2.13 슬라이드쇼

**R-2C1 · 재생 메뉴의 `Start the slideshow`와 `p` 키가 슬라이드쇼를 돌린다**
정해 둔 시간마다 한 장씩 스스로 넘어간다. 시간은 설정 패널에서 2초에서 30초 사이로
고른다(기본 5초).

기다림은 페이지에 매여 있다. 넘어간 순간부터 다시 세므로, 사람이 손으로 넘긴 뒤에도
꽉 찬 시간을 받는다 — 넘어가자마자 또 넘어가는 일이 없다. 넓은 페이지를 반씩 읽는
중이면(`R-229`) 반쪽이 한 번의 넘김이다.

**더 갈 곳이 없으면 스스로 멈춘다.** 책 끝 동작(`R-212`)이 `stop`이면 마지막 장에서
멈추고, `wrap`이면 계속 돌고, `next`면 이웃한 책이 열리며 그 책은 멈춘 채로 시작한다.

도는 동안 그 항목의 이름은 "Stop the slideshow"가 되고 `aria-checked`가 참이 된다.

**돌기 시작하면 메뉴바가 함께 숨는다**(`R-252`). 도는 동안 화면에는 페이지만 남는다.
멈출 때는 메뉴바를 되부르지 않는다 — 슬라이드쇼 전에 손으로 숨겨 두었을 수도 있고,
되부르는 길은 `h` 키와 가운데 탭이 이미 가지고 있다. Escape는 전체화면을 벗기기 전에
슬라이드쇼를 먼저 멈춘다(`R-2A3`).
✅ reader/story "each turn of the wait moves a page on", "it stops itself where it can go
no further", "escape stops it before it leaves anything else", "a wide page read in halves
gives each half a turn of the wait", "starting it takes the chrome down, so only the page is
left", "stopping it leaves the chrome down",
reader/subscription "moving to the other half of a page starts the wait again", "turning to
another page starts the wait again", "a reader that is not playing is not waiting for
anything",
chrome/screen "a running slideshow says so on its row", "and a stopped one says that",
"fullscreen and the slideshow say how to leave once they are on",
e2e "R-2C1 · 슬라이드쇼가 스스로 페이지를 넘긴다"

---

## 3. 저장

**P-301 · 책은 IndexedDB에 남는다**
원본 바이트 그대로. 새로고침해도 책장이 그대로다. 데이터베이스는 `comicyuri`,
스토어는 `books`이고 키는 책 id다. 그래서 같은 파일을 다시 들여오면 레코드가 하나
더 생기지 않고 덮어쓰인다(`S-115`).

읽기는 `readonly`, 쓰기와 삭제는 `readwrite` 트랜잭션이다. 연결은 호출마다 열고
어떻게 끝나든 닫는다 — 실패로 끝났을 때도 그렇다.

책장의 순서는 뷰가 아니라 이 계층이 정한다. `createdAt` 내림차순이므로 새로고침이
격자를 다시 배열하는 일이 없다(`S-102`).
✅ db "the most recently imported book comes first", "an empty store comes back empty
rather than failing", "a book written once comes back", "writing the same id again
replaces the record rather than adding one", "a removed book is gone", "removing an id
that is not there is not a failure", "reading takes a readonly transaction and writing a
readwrite one", "every call closes the connection it opened", "a failed request still
closes the connection",
e2e "P-301 · 책은 새로고침을 넘겨 책장에 남는다"

**P-302 · 책마다 남는 것은 읽던 위치·북마크·묶기 교정·세운 각도, 그리고 그 책의 설정이다**
키는 `comicyuri:progress:<book id>`. 나중에 붙은 항목들은 모두 디코딩 기본값을 지고
있어서, 그것들이 생기기 전에 저장된 책도 읽던 자리와 북마크를 잃지 않는다.

읽던 위치는 리더가 **스스로 옮긴** 자리다. 책을 열면서 받아 든 자리는 적지 않는다 —
되받아 적으면 그것이 저장된 자리를 덮어써서, 물어보는 중에는 물음이 스스로를 지우고
(`R-2B5`) 처음부터 보기로 한 사람은 책을 열었다 나가는 것만으로 읽던 자리를 잃는다.

그 책의 설정은 `Option`이 아니라 `null`로 저장한다. `Schema.Option`이 인코딩하는
모양은 JSON을 거쳐 그대로 디코딩되지 않는다.
✅ storage "position, bookmarks, bindings and rotation survive the round trip", "settings of
its own survive the round trip", "saving settings keeps the position and bookmarks
already stored", "a record written before books could remember anything still reads",
state/progress "saveProgress writes the same record the atom does", "every turn is written,
and the last one is what is stored",
e2e "P-302 · 읽던 위치와 북마크가 남는다"

**P-303 · 설정은 localStorage에 남는다**
키는 `comicyuri:settings`. 방향·한두장·맞춤·테마·책 끝 동작·슬라이드쇼 간격·이어 읽기
방식.
✅ state/settings "what was written is what a later session reads", "nothing written yet
reads as the defaults",
e2e "P-303 · 설정은 남고 다음 책에도 적용된다"

**P-304 · 저장된 값이 깨져 있으면 기본값으로 떨어진다**
스키마로 디코딩하므로, 손상되거나 오래된 항목이 UI에 도달하지 않는다.
✅ storage "a settings blob that no longer decodes falls back rather than reaching
the app"

**P-305 · 오래된 설정 blob은 빠진 항목만 기본값으로 채워진다**
필드마다 디코딩 기본값을 들고 있다.
✅ storage "a blob written by an older build gains the fields it never had"

**P-306 · 저장이 불가능해도 읽기는 계속된다**
시크릿 모드처럼 localStorage를 쓸 수 없어도 조용히 넘어간다.
✅ state/settings "reading falls back to the defaults rather than throwing", "writing does
not throw, and the session keeps what it chose",
state/progress "saving does not throw into the reader"

**P-307 · 책을 들여오면 서재를 지워지지 않게 해 달라고 요청한다**
요청하지 않은 저장소는 best-effort라서, 디스크가 모자라면 브라우저가 알리지 않고 이
출처의 IndexedDB를 비울 수 있다. 서재는 원본 바이트의 사본이므로(`P-301`) 그렇게
사라지면 되찾을 길이 없다. 그래서 임포트가 끝날 때마다 `navigator.storage.persist()`를
요청한다. 이미 영구면 다시 요청하지 않는다.

허락 여부는 브라우저가 정하고, Chromium은 묻지 않고 방문 이력 같은 신호로 판단한다.
거절되어도 알리지 않고 지금처럼 쓴다.
✅ e2e "P-307 · 책을 들여오면 브라우저에 서재를 지워지지 않게 해 달라고 요청한다"
❓ 실제로 영구가 되었는지 — Chrome의 `chrome://settings/content/all`이나 DevTools
Application › Storage에서 확인

---

## 4. 주소와 이동

**N-401 · 책장은 `/`, 리더는 `/book/<id>`**
탭 제목도 그것을 따라간다 — 책장은 `comicyuri`, 리더는 `comicyuri — <id>`.
✅ e2e "N-401 · 책장은 `/`, 리더는 `/book/<id>`"

**N-402 · 뒤로 가기가 책에서 나온다**
앞으로 가기는 도로 들어간다. 나올 때 리더는 화면에서 내려간다.
✅ e2e "N-402 · 뒤로 가기가 책에서 나오고, 앞으로 가기가 도로 들어간다"

**N-403 · 새로고침해도 읽던 책으로 돌아온다**
URL이 어느 책인지 말하고, 어느 자리에서 열지는 `R-2B5`가 정한다. 기본값은 읽던
자리다.
✅ e2e "N-403 · 새로고침해도 읽던 책으로 돌아온다"

**N-404 · 링크 클릭은 페이지를 다시 읽지 않는다**
문서가 그대로 남는지로 가른다. 문서에 표를 꽂아 두고 링크를 누르면 표가 살아
있고, 새로고침하면 사라진다.
✅ e2e "N-404 · 링크 클릭은 페이지를 다시 읽지 않는다"

**N-405 · 없는 주소는 안내와 함께 돌아갈 길을 준다**
"Nothing here"와 찾다 못 찾은 경로, 그리고 책장으로 가는 링크. 탭 제목은
`comicyuri — not found`.
✅ e2e "N-405 · 없는 주소는 안내와 함께 돌아갈 길을 준다"

**N-406 · 이름에 공백이나 한글이 있는 책도 열린다**
책 id는 파일 이름을 그대로 담으므로, 경로에 실을 때 인코딩하고 읽을 때 되돌린다.
콜론은 그대로 두므로 `href`는 여전히 `/book/volume-1::42` 모양이다.
✅ e2e "N-406 · 이름에 공백이 있는 책도 열린다",
"N-406 · 이름에 공백이 있는 책은 새로고침 뒤에도 그 자리다"

**N-407 · 배포된 곳에서도 주소로 곧장 들어올 수 있다**
`/book/<id>`에는 파일이 없으므로 호스트가 `index.html`을 내주어야 한다. Cloudflare
Pages와 Netlify는 `_redirects`를, Vercel은 `vercel.json`을 읽는다. GitHub Pages는
앱을 `/comicyuri/` 아래에 놓고 재작성 규칙이 없으므로, `github-pages` 모드로
빌드한다 — 자산과 라우트가 그 경로 아래를 가리키고, 없는 경로에는 같은 문서인
`404.html`이 상태 404로 나간다. `main`에 들어오면 워크플로가 올린다.
✅ e2e "N-407 · 빌드 결과가 SPA 폴백 설정을 지고 나간다",
"N-407 · 저장소 이름 아래에서 책장과 리더가 오간다",
"N-407 · 리더 주소로 곧장 들어오면 `404.html`이 앱을 띄운다",
"N-407 · 없는 주소에서 돌아가는 링크도 저장소 이름 아래를 가리킨다",
"N-407 · 끝의 슬래시 없이 와도 책장이다"

---

## 5. 실패했을 때

**F-501 · 실패는 상태줄에 4초간 머문다**
"Couldn't do that — <이유>" 형태.
✅ shelf/screen "a drop carrying no files is reported rather than imported",
shelfNotice/screen "a failure does not inherit the time left on the one before it"

**F-502 · 새 실패가 앞선 실패의 시간을 잡아먹지 않는다**
사이에 임포트가 끼어 상태 줄이 "Importing…"이나 빈 줄을 거쳐도 마찬가지다. 새 실패는
새 객체라 앞선 대기가 정리되고 새로 시작한다.
✅ shelfNotice/screen "a failure does not inherit the time left on the one before it"

**F-503 · 실패 메시지가 진행 중인 작업 안내를 지우지 않는다**
반대쪽도 같다. 임포트가 도는 동안 들어온 실패는 그 임포트가 끝나면서 지워지지 않는다 —
끝난 작업은 자기가 세운 대기만 거둔다. 실패는 아직 제 4초를 다 쓰지 않았다.
✅ shelfNotice/screen "an import that took the line over is not cleared by the wait of the failure before
it",
shelf/screen "a failure that arrived during an import survives it finishing"

**F-504 · 책장을 읽지 못하면 빈 책장이 아니라 실패를 보여준다**
"Couldn't open your shelf — <이유>"가 격자 자리에 선다.
✅ shelfNotice/screen "a shelf that failed to open says so instead of showing an empty grid"

**F-505 · 다시 읽기가 실패해도 이미 있던 책은 남는다**
✅ shelfNotice/screen "a reload that fails keeps the books it already had"

**F-506 · IndexedDB를 아예 열 수 없어도 실패로 보고된다**
`indexedDB`가 없거나 시크릿 모드처럼 `open`이 던지는 환경에서도 defect가 아니라
`DbError`가 된다. 실패한 요청의 이름이 `op`로 실리므로, 상태 줄의 문구가 어느
호출에서 멎었는지 말한다(`F-507`).
✅ db "no indexedDB at all is reported as a failure to open", "an open that throws is
reported rather than thrown", "an open that errors is reported as a failure to open",
"a request that errors is reported under the name of that request"

**F-507 · 실패 문구**

| 상황                 | 문구                                           |
| -------------------- | ---------------------------------------------- |
| IndexedDB            | `Shelf storage is unavailable (<연산>)`        |
| 손상된 아카이브      | `Not a valid ZIP/CBZ archive`                  |
| 이미지 없는 아카이브 | `No images found in "<제목>"`                  |
| 책장에 없는 책       | `That book is no longer on the shelf ("<id>")` |
| 임포트할 것이 없음   | `No comic files found (images or .cbz/.zip)`   |
| 지원하지 않는 압축   | `Unsupported compression method <n>`           |
| 📖                   |

**F-508 · 실패는 색만으로 구분되지 않는다**
전용 색(`--color-danger`)에 더해 "Couldn't do that —" 접두사가 붙는다.
✅ shelf/screen "a drop carrying no files is reported rather than imported"
❓ 실제로 칠해지는 색

**F-509 · 없는 책과 빈 책은 다르게 말한다**
지워진 책을 가리키는 링크나 북마크는 열어 볼 것 자체가 없으므로, 열어 보니 비어
있는 아카이브와 문구가 갈린다.
✅ e2e "F-509 · 지워진 책을 가리키는 링크는 없어졌다고 말한다"

---

## 6. 알려진 한계

| ID    | 내용                                                                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L-610 | 화면 테스트(`vp run test:screen`)는 실제 Chromium에 컴포넌트를 세우지만 앱 전체를 세우지는 않는다 — 라우터와 `main.tsx`와 저장 계층이 실제로 맞물리는 자리는 `vp run e2e`에서만 드러난다 |

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
- [x] R-251 · R-252 툴바가 스스로 숨지 않는 것과 숨기면 스테이지가 높이를 가져가는 것
- [x] R-272 썸네일 패널이 열리는 즉시 채워지는지
- [x] R-291 · R-292 전체화면
- [x] P-301~303 새로고침 후 책장·위치·설정 유지

**여전히 사람 눈이 필요한 것**

- [ ] R-232 실기기에서 두 손가락의 감각
- [ ] R-246 마우스 휠과 트랙패드를 가르는 짐작이 실제 장치에서 맞는지 — 하네스가
      만드는 휠 이벤트는 언제나 마우스로 보인다
- [ ] R-244 창이 포커스를 잃어 `pointerup`이 오지 않는 경우 — 재현이 불안정하다

**확인 완료**

- [x] R-206 페이지가 그릴 수 있게 된 뒤에 걸리는지 · R-215 미리 읽은 것이 디코딩까지
      되어 있는지 (2026-09-12) — 실제 아카이브로 빈 프레임을 세어 확인했다. 숫자는
      `R-206`에 있다
- [x] R-264 RTL에서 슬라이더가 오른쪽에서 왼쪽으로 채워지고 줄어드는 감각 (2026-09-09)
- [x] R-265 슬라이더 포커스 중 화살표가 한 번에 한 페이지만 넘기는지 (2026-09-09)
