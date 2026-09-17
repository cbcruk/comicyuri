/** React 앱의 진입점. `index.html`이 부른다. */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'

import { Providers } from './providers.tsx'
import { router } from './router.tsx'

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
