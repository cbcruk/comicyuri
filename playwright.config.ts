import { defineConfig, devices } from '@playwright/test'

/**
 * 브라우저에서만 확인할 수 있는 것들을 위한 하네스. `SPEC.md`의 ❓ 항목이 여기
 * 대상이다 — 레이아웃과 계산된 색, 실제 포인터 입력, 브라우저 API, 그리고 새로고침
 * 뒤에도 남는지.
 *
 * 프로덕션 빌드를 미리보기로 띄워 시험한다. 개발 서버가 아니라 실제로 나가는
 * 번들이어야 `import.meta.hot`으로 갈리는 동작(R-245 탭 표시)까지 사실대로 나온다.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      // 탭과 스와이프, 핀치가 터치로 도착해야 하므로 터치를 켠 채로 둔다.
      use: { ...devices['Desktop Chrome'], hasTouch: true },
    },
  ],
  webServer: {
    // `vp`는 전역 CLI지만 여기서는 확실히 이 저장소의 것을 쓰도록 경로로 부른다.
    command: 'node_modules/.bin/vp build && node_modules/.bin/vp preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
})
