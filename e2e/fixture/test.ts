/**
 * e2e가 쓰는 `test`. 기본값으로 손잡이 선택기를 걷어 낸다(`S-122`).
 *
 * Playwright는 네이티브 파일 선택기를 몰 수 없다. `showOpenFilePicker`가 있는 Chromium에서
 * 앱이 그 길로 가면 테스트가 선택기 앞에서 멎으므로, 기본은 숨은 `input`으로 고르는
 * 폴백 길이다 — Firefox·Safari 사용자가 가는 길이기도 하다.
 *
 * 손잡이 길은 `handles.spec.ts`가 OPFS로 진짜 손잡이를 지어 따로 잰다.
 */

import { test as base } from '@playwright/test'

export { expect } from '@playwright/test'

/** 이 테스트가 손잡이 선택기를 가진 브라우저인 척할지. 기본은 아니다. */
export type HandlesOption = Readonly<{ hasFilePickers: boolean }>

export const test = base.extend<HandlesOption>({
  hasFilePickers: [false, { option: true }],

  page: async ({ page, hasFilePickers }, use) => {
    if (!hasFilePickers) {
      await page.addInitScript(() => {
        Reflect.deleteProperty(window, 'showOpenFilePicker')
        Reflect.deleteProperty(window, 'showDirectoryPicker')
      })
    }
    await use(page)
  },
})
