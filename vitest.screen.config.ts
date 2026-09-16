/**
 * 화면 테스트. 실제 Chromium에서 컴포넌트를 세워 보고 눌러 본다.
 *
 * Foldkit의 scene 테스트가 하던 일을 이것이 이어받는다. `vp test`가 돌리는 유닛
 * 테스트(happy-dom)와 따로 두는 이유는 둘의 환경과 속도가 다르기 때문이다 —
 * `vp run test:screen`으로 돌린다.
 */

import { defineConfig } from 'vite-plus'

import tailwindcss from '@tailwindcss/vite'
import { playwright } from 'vite-plus/test/browser-playwright'

export default defineConfig({
  plugins: [tailwindcss()],
  test: {
    include: ['src/**/*.screen.test.tsx'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
})
