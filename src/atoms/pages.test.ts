/**
 * 페이지 로딩 atom이 지금 리더가 손으로 지키는 규칙을 스스로 지키는지.
 *
 * 레지스트리만 쓰고 React는 없다. 구독하는 것이 곧 화면이 그 스프레드를 원하는 것이고,
 * 구독을 놓는 것이 곧 화면이 떠난 것이다.
 */

import { Array, Effect, Option } from 'effect'
import { AsyncResult, AtomRegistry } from 'effect/unstable/reactivity'
import { describe, expect, test } from 'vite-plus/test'

import { ArchiveError } from '../errors.ts'
import type { LoadedBook, Page } from '../types.ts'
import { makePageAtoms } from './pages.ts'
import type { SpreadPanel } from './pages.ts'

const BOOK_ID = 'volume-1::42'

/** 브라우저 대신 URL과 디코딩, 압축 풀기를 세는 가짜. */
const makeWorld = (pageCount: number) => {
  const live = new Set<string>()
  const revoked: Array<string> = []
  const reads = globalThis.Array.from({ length: pageCount }, () => 0)
  const heldDecodes = new Map<string, () => void>()
  let isHoldingDecodes = false
  let created = 0

  const page = (index: number): Page => ({
    name: `page-${index + 1}.png`,
    load: () => Effect.die('atoms never cache URLs on the page'),
    unload: () => undefined,
    measure: () => Effect.succeed(Option.none()),
    read: () =>
      Effect.sync(() => {
        reads[index] = (reads[index] ?? 0) + 1
        return new Blob([`page ${index}`])
      }),
  })

  const book: LoadedBook = {
    id: BOOK_ID,
    title: 'Volume 1',
    source: 'zip',
    pages: globalThis.Array.from({ length: pageCount }, (_, index) => page(index)),
    pageSizes: globalThis.Array.from({ length: pageCount }, () => Option.none()),
  }

  const atoms = makePageAtoms({
    openBook: () => Effect.succeed(book),
    createUrl: () => {
      created += 1
      const url = `blob:${created}`
      live.add(url)
      return url
    },
    revokeUrl: (url) => {
      live.delete(url)
      revoked.push(url)
    },
    decode: (url) =>
      isHoldingDecodes
        ? Effect.promise(() => new Promise<void>((resolve) => heldDecodes.set(url, resolve)))
        : Effect.void,
  })

  return {
    atoms,
    book,
    live,
    revoked,
    reads,
    get created() {
      return created
    },
    /** 이제부터 디코딩을 붙잡는다. 풀어 줄 때까지 스프레드는 성공하지 못한다. */
    holdDecodes: () => {
      isHoldingDecodes = true
    },
    /** 붙잡힌 디코딩 가운데 그 URL의 것을 끝낸다. */
    finishDecode: (url: string) => {
      heldDecodes.get(url)?.()
      heldDecodes.delete(url)
    },
    heldUrls: () => [...heldDecodes.keys()],
  }
}

/** 조건이 설 때까지 기다린다. 레지스트리는 치우는 일을 다음 틱으로 미룬다. */
const eventually = async (check: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
  throw new Error('the condition never held')
}

const panelsOf = (
  result: AsyncResult.AsyncResult<ReadonlyArray<SpreadPanel>, unknown>,
): Option.Option<ReadonlyArray<SpreadPanel>> => AsyncResult.value(result)

describe('a spread', () => {
  test('is not ready until every page on it can be drawn', async () => {
    const world = makeWorld(6)
    const registry = AtomRegistry.make()
    world.holdDecodes()
    const spread = world.atoms.spread(BOOK_ID, [1, 2])

    registry.mount(spread)
    await eventually(() => world.heldUrls().length === 2)
    expect(AsyncResult.isSuccess(registry.get(spread))).toBe(false)

    const [first, second] = world.heldUrls()
    world.finishDecode(first ?? '')
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(AsyncResult.isSuccess(registry.get(spread))).toBe(false)

    world.finishDecode(second ?? '')
    await eventually(() => AsyncResult.isSuccess(registry.get(spread)))
    expect(
      Array.map(
        Option.getOrElse(panelsOf(registry.get(spread)), () => []),
        (panel) => panel.page,
      ),
    ).toStrictEqual([1, 2])
  })

  test('a page that is not in the book fails the spread', async () => {
    const world = makeWorld(6)
    const registry = AtomRegistry.make()
    const spread = world.atoms.spread(BOOK_ID, [9])

    registry.mount(spread)
    await eventually(() => AsyncResult.isFailure(registry.get(spread)))
    expect(AsyncResult.error(registry.get(spread))).toStrictEqual(
      Option.some(new ArchiveError({ reason: { kind: 'pageMissing', page: 10 } })),
    )
  })
})

describe('page URLs', () => {
  test('letting go of a spread gives its page URLs back', async () => {
    const world = makeWorld(6)
    const registry = AtomRegistry.make()
    const spread = world.atoms.spread(BOOK_ID, [3])

    const release = registry.mount(spread)
    await eventually(() => AsyncResult.isSuccess(registry.get(spread)))
    expect(world.live.size).toBe(1)

    release()
    await eventually(() => world.live.size === 0)
    expect(world.revoked).toStrictEqual(['blob:1'])
  })

  test('a page two spreads want at once is unpacked into one URL', async () => {
    // 지금 리더는 여기서 URL을 둘 만들고 하나를 잃는다. 화면에 걸 스프레드와 미리 읽을
    // 이웃이 같은 페이지를 동시에 부르기 때문이다. 여기서는 서로 다른 스프레드 셋이
    // 한꺼번에 2페이지를 원한다.
    const world = makeWorld(6)
    const registry = AtomRegistry.make()
    const spreads = [
      world.atoms.spread(BOOK_ID, [2]),
      world.atoms.spread(BOOK_ID, [1, 2]),
      world.atoms.spread(BOOK_ID, [2, 3]),
    ]

    Array.forEach(spreads, (spread) => registry.mount(spread))
    await eventually(() =>
      Array.every(spreads, (spread) => AsyncResult.isSuccess(registry.get(spread))),
    )

    expect(world.created).toBe(3)
    expect(world.reads).toStrictEqual([0, 1, 1, 1, 0, 0])
  })

  test('a page still on screen keeps its URL when a neighbour sharing it lets go', async () => {
    const world = makeWorld(6)
    const registry = AtomRegistry.make()
    const single = world.atoms.spread(BOOK_ID, [1])
    const pair = world.atoms.spread(BOOK_ID, [1, 2])

    registry.mount(single)
    const releasePair = registry.mount(pair)
    await eventually(() => AsyncResult.isSuccess(registry.get(pair)))
    const pageOneUrl = Option.getOrElse(
      AsyncResult.value(registry.get(world.atoms.pageUrl(BOOK_ID, 1))),
      () => '',
    )

    releasePair()
    await eventually(() => world.live.size === 1)
    expect([...world.live]).toStrictEqual([pageOneUrl])
  })

  test('leaving the book leaves no page URL behind', async () => {
    const world = makeWorld(12)
    const registry = AtomRegistry.make()
    const releases = Array.map([[4], [3], [5], [6, 7]], (pages) =>
      registry.mount(world.atoms.spread(BOOK_ID, pages)),
    )
    await eventually(() => world.live.size === 5)

    Array.forEach(releases, (release) => release())
    await eventually(() => world.live.size === 0)
    expect(world.revoked).toHaveLength(5)
  })

  test('a spread left while its pages are still decoding gives the URLs back too', async () => {
    const world = makeWorld(6)
    const registry = AtomRegistry.make()
    world.holdDecodes()
    const spread = world.atoms.spread(BOOK_ID, [4])

    const release = registry.mount(spread)
    await eventually(() => world.heldUrls().length === 1)

    release()
    await eventually(() => world.live.size === 0)
  })
})

describe('answers that arrive late', () => {
  test('land on their own spread and leave the one on screen alone', async () => {
    const world = makeWorld(6)
    const registry = AtomRegistry.make()
    world.holdDecodes()
    const left = world.atoms.spread(BOOK_ID, [1])
    const current = world.atoms.spread(BOOK_ID, [5])

    registry.mount(left)
    registry.mount(current)
    await eventually(() => world.heldUrls().length === 2)
    const [leftUrl, currentUrl] = world.heldUrls()

    world.finishDecode(currentUrl ?? '')
    await eventually(() => AsyncResult.isSuccess(registry.get(current)))
    const shown = registry.get(current)

    world.finishDecode(leftUrl ?? '')
    await eventually(() => AsyncResult.isSuccess(registry.get(left)))

    expect(registry.get(current)).toBe(shown)
    expect(
      Option.map(
        panelsOf(registry.get(left)),
        Array.map((panel) => panel.page),
      ),
    ).toStrictEqual(Option.some([1]))
  })
})
