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
 * 길이 이미 둘 있다 — 슬라이더와 썸네일 격자 — 그래서 이것은 "한 화면에 없는
 * 앞쪽을 훑는" 한 가지 크기면 된다.
 */
export const SKIP_PAGES = 10

/** 페이지 슬라이더. 부모가 드래그 구독을 lift 할 때 이 id로 부른다. */
export const SLIDER_ID = 'reader-page-slider'

/** 번호를 적어 그 페이지로 가는 입력란. */
export const GOTO_ID = 'reader-go-to-page'

/** 페이지 격자. 부모가 리스트 구독을 lift 할 때 이 id로 부른다. */
export const THUMBS_ID = 'reader-thumbs'

/**
 * 격자 한 칸의 너비(픽셀). 행 높이에서 라벨을 뺀 자리에 인쇄된 만화 한 쪽이
 * 통째로 들어가는 크기다.
 *
 * 칸은 늘어나지 않는다. 늘리면 창이 넓어질수록 같은 네 칸이 서로 멀어지기만
 * 하고 썸네일은 그대로 작다. 대신 한 행에 들어가는 칸의 수가 늘어난다.
 */
export const THUMB_WIDTH = 104

/** 칸과 칸 사이(픽셀). Tailwind의 `gap-3`과 같은 값이라 둘이 어긋나면 안 된다. */
export const THUMB_GAP = 12

/**
 * 격자가 좌우로 두는 여백(픽셀). 행의 `px-1` 둘을 더한 것이다.
 *
 * 리스트의 `p-4`는 여기 들어가지 않는다. 가상 리스트는 행을 절대 위치로 놓아서
 * 그 여백 밖으로 넘어가고, 행이 실제로 쓰는 너비는 창의 너비 그대로다.
 */
export const THUMB_INSET = 8

/** 아무리 좁아도 이보다 적게 세우지는 않는다. */
export const THUMBS_PER_ROW_MIN = 2

/**
 * 폭을 재기 전에 쓰는 행당 칸 수. 첫 프레임에만 쓰이고, 곧 실제로 잰 값이
 * 그 자리를 대신한다.
 */
export const THUMBS_PER_ROW_DEFAULT = 4

/**
 * 행 높이(픽셀). 가상 리스트가 아직 아무것도 재기 전에 패널이 몇 행을 담을지
 * 알려면 이 값이 필요하다.
 */
export const THUMB_ROW_HEIGHT = 180

/** 화면에 보이는 행 너머로 더 읽어 두는 행 수. 스크롤하면 이미 준비되어 있다. */
export const THUMB_OVERSCAN = 2
