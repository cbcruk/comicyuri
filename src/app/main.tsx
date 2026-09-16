/**
 * React 앱의 진입점. `app.html`이 부른다.
 *
 * 마이그레이션이 끝나면 이 문서가 `index.html`이 되고 Foldkit 진입점(`entry.ts`)은
 * 사라진다. 그때까지 두 앱이 각자의 문서로 나란히 선다.
 */

import { Effect } from 'effect'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'

import { loadSettings } from '../io/storage.ts'
import { Providers } from './providers.tsx'
import { router } from './router.tsx'

// 테마는 무엇을 그리기 전에 알아야 한다. 저장소에서 읽는 일은 동기적으로 끝난다.
const settings = await Effect.runPromise(loadSettings)

const root = document.getElementById('root')
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <Providers theme={settings.theme}>
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>,
  )
}
