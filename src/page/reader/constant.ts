/** 포인터가 이 위에 있어야 그 제스처를 읽기로 친다. */
export const STAGE_ID = 'reader-stage'

/** 페이지 슬라이더. 부모가 드래그 구독을 lift 할 때 이 id로 부른다. */
export const SLIDER_ID = 'reader-page-slider'

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
