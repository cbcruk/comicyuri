/**
 * 브라우저 탭 제목. 지금 선 자리를 따라간다(`N-401`, `N-405`).
 *
 * Foldkit에서는 `view`가 문서를 통째로 돌려주었고 런타임이 제목까지 걸었다. React에서는
 * 그런 자리가 없으므로 화면마다 이 훅으로 건다.
 */

import { useEffect } from 'react'

/** 화면이 서 있는 동안 탭 제목을 이것으로 둔다. */
export const useDocumentTitle = (title: string): void => {
  useEffect(() => {
    document.title = title
  }, [title])
}
