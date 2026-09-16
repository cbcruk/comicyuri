/**
 * Atom 시험의 측정: 페이지 로딩 경로의 object URL 수명과 넘김 지연.
 *
 * 평소 e2e에서는 건너뛴다. `SPIKE_MEASURE=<결과를 쓸 폴더>`를 주고 돌리면 회차마다
 * `run-<n>.json`을 남긴다. 0단계 기준선과 3단계 비교가 같은 시나리오를 쓰려고 둔다.
 */

import { writeFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { control, openReader, openShelf, importBook, stage, use } from '../fixture/app.ts'

const OUT = process.env['SPIKE_MEASURE'] ?? ''
const BOOK = { fileName: 'volume-40.cbz', pageCount: 40, size: { width: 1600, height: 2400 } }
const SETTLE = 1_000

/**
 * `URL.createObjectURL`/`revokeObjectURL`을 감싸 살아 있는 URL을 세고, 매 프레임 페이지
 * 상자를 보아 빈 프레임과 페이지가 처음 보인 시각을 적는다.
 *
 * 표지 썸네일은 형식이 붙은 `Blob`이고 아카이브에서 푼 페이지는 형식이 없으므로, 그것으로
 * 둘을 가른다. 결과는 `window.__spikeMeasure`에 평범한 객체로 둔다.
 */
const instrument = (page: Page) =>
  page.addInitScript(() => {
    const kinds = new Map<string, 'cover' | 'page'>()
    const seen: Record<string, number> = {}
    const stats = {
      livePages: 0,
      liveCovers: 0,
      created: 0,
      revoked: 0,
      peakPages: 0,
      blankFrames: 0,
      seen,
    }
    const create = URL.createObjectURL.bind(URL)
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = (object: Blob | MediaSource) => {
      const url = create(object)
      const kind = object instanceof Blob && object.type !== '' ? 'cover' : 'page'
      kinds.set(url, kind)
      stats.created += 1
      if (kind === 'page') stats.livePages += 1
      else stats.liveCovers += 1
      stats.peakPages = Math.max(stats.peakPages, stats.livePages)
      return url
    }
    URL.revokeObjectURL = (url: string) => {
      const kind = kinds.get(url)
      if (kind !== undefined) {
        kinds.delete(url)
        stats.revoked += 1
        if (kind === 'page') stats.livePages -= 1
        else stats.liveCovers -= 1
      }
      revoke(url)
    }
    const sample = (time: number) => {
      const box = document.getElementById('reader-page')
      if (box !== null) {
        const image = box.querySelector('img')
        if (image === null) stats.blankFrames += 1
        else if (image.complete && stats.seen[image.alt] === undefined) stats.seen[image.alt] = time
      }
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
    Object.assign(window, { __spikeMeasure: stats })
  })

type Snapshot = Readonly<{
  livePages: number
  liveCovers: number
  created: number
  revoked: number
  peakPages: number
  blankFrames: number
  seen: Readonly<Record<string, number>>
}>

const snapshot = (page: Page): Promise<Snapshot> =>
  page.evaluate(() => structuredClone(Reflect.get(window, '__spikeMeasure')))

/** 지금 프레임의 시각. `requestAnimationFrame`이 넘겨주는 값이라 `seen`과 같은 시계다. */
const frameTime = (page: Page): Promise<number> =>
  page.evaluate(() => new Promise<number>((resolve) => requestAnimationFrame(resolve)))

/** 버튼을 누르기 직전 프레임부터 그 페이지가 디코딩되어 처음 보인 프레임까지. */
const turnTo = async (
  page: Page,
  press: () => Promise<void>,
  pageNumber: number,
): Promise<number> => {
  const alt = `Page ${pageNumber}`
  await page.evaluate(
    (name) => Reflect.deleteProperty(Reflect.get(window, '__spikeMeasure').seen, name),
    alt,
  )
  const before = await frameTime(page)
  await press()
  await expect(stage(page).getByRole('img', { name: alt })).toBeVisible()
  await page.waitForFunction(
    (name) => Reflect.get(Reflect.get(window, '__spikeMeasure').seen, name) !== undefined,
    alt,
  )
  const seen = (await snapshot(page)).seen[alt] ?? before
  return Math.round(seen - before)
}

const median = (values: ReadonlyArray<number>): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

test('baseline · page loading path', async ({ page }, info) => {
  test.skip(OUT === '', 'SPIKE_MEASURE가 없으면 재지 않는다')
  test.setTimeout(120_000)
  await instrument(page)
  await openShelf(page)
  const title = await importBook(page, BOOK)
  await page.waitForTimeout(SETTLE)
  const shelf = await snapshot(page)

  await openReader(page, title)
  await page.waitForTimeout(SETTLE)
  const opened = await snapshot(page)

  const warmTurns: Array<number> = []
  for (let n = 2; n <= 21; n++) {
    warmTurns.push(await turnTo(page, () => control.next(page).click(), n))
  }
  await page.waitForTimeout(SETTLE)
  const afterReading = await snapshot(page)

  const coldLast = await turnTo(page, () => control.last(page).click(), 40)
  await page.waitForTimeout(SETTLE)
  const afterLast = await snapshot(page)

  const coldFirst = await turnTo(page, () => control.first(page).click(), 1)
  await page.waitForTimeout(SETTLE)
  const afterFirst = await snapshot(page)

  // 답을 기다리지 않고 열 번 넘긴다.
  for (let turn = 0; turn < 10; turn++) await control.next(page).click()
  await expect(stage(page).getByRole('img', { name: 'Page 11' })).toBeVisible()
  await page.waitForTimeout(SETTLE)
  const afterRapid = await snapshot(page)

  await use(page, 'shelf')
  await expect(page.getByRole('link', { name: title })).toBeVisible()
  await page.waitForTimeout(SETTLE)
  const afterLeaving = await snapshot(page)

  const pick = ({ livePages, liveCovers, created, revoked, peakPages, blankFrames }: Snapshot) => ({
    livePages,
    liveCovers,
    created,
    revoked,
    peakPages,
    blankFrames,
  })
  const result = {
    run: info.repeatEachIndex,
    checkpoints: {
      shelf: pick(shelf),
      opened: pick(opened),
      afterReading20: pick(afterReading),
      afterLast: pick(afterLast),
      afterFirst: pick(afterFirst),
      afterRapid10: pick(afterRapid),
      afterLeaving: pick(afterLeaving),
    },
    latencyMs: {
      warmTurnMedian: median(warmTurns),
      warmTurnMax: Math.max(...warmTurns),
      coldLast,
      coldFirst,
    },
  }
  writeFileSync(`${OUT}/run-${info.repeatEachIndex}.json`, JSON.stringify(result, null, 2))
})
