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

/** 표지를 혼자 두는 스위치. 라벨과 설명이 이 id에서 갈라져 나온다. */
export const COVER_ALONE_ID = 'reader-cover-alone'

/** 작은 페이지를 늘릴지 정하는 스위치. */
export const ENLARGE_ID = 'reader-enlarge-to-fit'

/** 넓은 페이지를 반씩 읽을지 정하는 스위치. */
export const SPLIT_ID = 'reader-split-wide'

/** 설정을 책마다 기억할지 정하는 스위치. */
export const REMEMBER_ID = 'reader-remember-book-settings'

/** 넓은 페이지 문턱이 한 번 누를 때 움직이는 폭. */
export const THRESHOLD_STEP = 0.02
/** 문턱의 아래쪽 끝. 이보다 낮으면 세로로 긴 페이지까지 혼자 서기 시작한다. */
export const THRESHOLD_MIN = 0.5
/** 문턱의 위쪽 끝. 정사각형보다 넓은 페이지만 혼자 서는 자리다. */
export const THRESHOLD_MAX = 1

/** 페이지 격자. 부모가 리스트 구독을 lift 할 때 이 id로 부른다. */
export const THUMBS_ID = 'reader-thumbs'

/**
 * 가상 리스트는 칸이 아니라 행을 잰다. 그래서 썸네일 격자는 정해진 개수의
 * 페이지로 이루어진 행이다. 두 숫자 모두 재지 않고 고정한 값인데, 격자를
 * 리스트로 창 내는 대가다.
 */
export const THUMBS_PER_ROW = 4
/**
 * 행 높이(픽셀). 가상 리스트가 아직 아무것도 재기 전에 패널이 몇 행을 담을지
 * 알려면 이 값이 필요하다.
 */
export const THUMB_ROW_HEIGHT = 180

/** 화면에 보이는 행 너머로 더 읽어 두는 행 수. 스크롤하면 이미 준비되어 있다. */
export const THUMB_OVERSCAN = 2
