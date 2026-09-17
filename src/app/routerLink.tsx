/**
 * 라우터가 주소를 짓는 Astryx 링크.
 *
 * 앱 안의 링크는 두 가지를 함께 해야 한다. 모양은 Astryx `Link`가 지고, 주소와 이동은
 * TanStack 라우터가 진다 — 그래야 저장소 이름 아래에 놓였을 때도 그 아래를 가리키고
 * (`N-407`), 누르면 문서를 다시 받지 않고 화면만 바뀐다. `createLink`가 그 둘을 잇는 라우터의
 * 공식 길이다. `Link`는 받은 `href`와 `onClick`을 그대로 앵커에 넘긴다.
 */

import { Link } from '@astryxdesign/core/Link'
import { createLink } from '@tanstack/react-router'

/** `to`로 갈 곳을 받는 Astryx 링크. */
export const RouterLink = createLink(Link)
