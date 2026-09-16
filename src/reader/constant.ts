/** 포인터가 이 위에 있어야 그 제스처를 읽기로 친다. */
export const STAGE_ID = 'reader-stage'

/**
 * 지금 걸린 페이지를 담은 상자. 확대와 이동이 걸리는 자리이자, 굴림이 어디까지 갈
 * 수 있는지 재는 자리다.
 */
export const PAGE_ID = 'reader-page'

/**
 * 한 번 건너뛸 때 지나가는 페이지 수.
 *
 * 원본 뷰어는 이 값을 고르게 했지만, 여기서는 하나로 두었다. 크게 움직이는 다른
 * 길이 이미 있다 — 슬라이더, 썸네일 격자, 번호 입력란 — 그래서 이것은 "한 화면에
 * 없는 앞쪽을 훑는" 한 가지 크기면 된다.
 */
export const SKIP_PAGES = 10

/** 번호를 적어 그 페이지로 가는 입력란. */
export const GOTO_ID = 'reader-go-to-page'

/** 페이지 격자. 부모가 리스트 구독을 lift 할 때 이 id로 부른다. */
export const THUMBS_ID = 'reader-thumbs'

/**
 * 격자 한 칸의 최소 너비(픽셀).
 *
 * 한 행에 몇 칸이 설지를 이 너비로 세고, 남는 자리는 그 칸들이 고르게 나눠
 * 가지므로 실제 칸은 이보다 넓어질 수 있다(`cellWidthFor`).
 */
export const THUMB_WIDTH = 104

/** 칸과 칸 사이(픽셀). Tailwind의 `gap-3`과 같은 값이라 둘이 어긋나면 안 된다. */
export const THUMB_GAP = 12

/**
 * 격자가 좌우로 두는 여백(픽셀). 행의 `px-1` 둘을 더한 것이다.
 *
 * 리스트의 `p-4`는 여기 들어가지 않는다. 가상 리스트가 컨테이너에 인라인
 * `padding: 0`을 걸어 그 클래스를 덮으므로, 행이 쓰는 너비는 창의 너비 그대로다.
 */
export const THUMB_INSET = 8

/** 아무리 좁아도 이보다 적게 세우지는 않는다. */
export const THUMBS_PER_ROW_MIN = 2

/**
 * 폭을 재기 전에 쓰는 격자 너비(픽셀). 첫 프레임에만 쓰이고, 곧 실제로 잰 값이
 * 그 자리를 대신한다. 이 값에서는 네 칸이 서는데, 폭을 재기 전의 격자가 그
 * 모양이었다.
 */
export const THUMBS_DEFAULT_WIDTH = 480

/**
 * 칸 하나의 높이를 너비로 나눈 비. 인쇄된 만화 한 쪽이 2:3이므로 너비의 1.5배다.
 *
 * 칸이 넓어지면 높이도 이 비로 따라간다. 그러지 않으면 넓어진 칸 안에서
 * 썸네일만 그대로 작게 선다.
 */
export const THUMB_RATIO = 1.5

/**
 * 행 높이에 칸 높이 말고 더 얹는 몫(픽셀). 페이지 번호는 칸 안에 서므로, 이 몫은
 * 행과 행 사이의 빈 자리가 된다.
 */
export const THUMB_LABEL_HEIGHT = 24

/** 화면에 보이는 행 너머로 더 읽어 두는 행 수. 스크롤하면 이미 준비되어 있다. */
export const THUMB_OVERSCAN = 2
