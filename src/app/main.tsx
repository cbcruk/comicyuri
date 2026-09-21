/** React 앱의 진입점. `index.html`이 부른다. */

import { Effect } from 'effect'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'

import { applyLanguage } from './i18n/atoms.ts'
import { resolveLocale } from './i18n/locale.ts'
import { loadSettings } from '../io/storage.ts'
import { Providers } from './providers.tsx'
import { router } from './router.tsx'

// 문서의 언어는 첫 글자가 그려지기 전에 서야 한다(`S-151`). 테마를 `index.html`이 미리
// 세우는 것과 같은 이유다 — 글꼴과 줄바꿈 규칙이 그것을 본다.
applyLanguage(resolveLocale(Effect.runSync(loadSettings).locale, navigator.languages))

const root = document.getElementById('root')
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>,
  )
}
