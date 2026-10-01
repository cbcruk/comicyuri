/** S-122 · 손잡이로 들여온 책을 다시 열 때. 허락을 묻고, 없으면 그렇게 말한다. */

import { Effect, Option } from 'effect'
import { describe, expect, test, vi } from 'vite-plus/test'

import type { ArchiveError, ArchiveReason } from '../errors.ts'
import { fileFromHandle } from './handles.ts'

/**
 * 손잡이 하나를 흉내 낸다. 진짜는 Chromium에만 있고 사용자의 허락을 거쳐야 열리므로,
 * 여기서는 그 대답만 흉내 낸다.
 */
const handle = (
  answers: Readonly<{ standing: PermissionState; asked?: PermissionState; gone?: boolean }>,
) => {
  const requestPermission = vi.fn(() => Promise.resolve(answers.asked ?? answers.standing))

  return {
    handle: {
      name: 'volume-1.cbz',
      kind: 'file' as const,
      isSameEntry: () => Promise.resolve(false),
      queryPermission: () => Promise.resolve(answers.standing),
      requestPermission,
      getFile: () =>
        answers.gone === true
          ? Promise.reject(new Error('NotFoundError'))
          : Promise.resolve(new File(['bytes'], 'volume-1.cbz')),
      createWritable: () => Promise.reject(new Error('not needed')),
    },
    requestPermission,
  }
}

/** 실패한 까닭. 성공했으면 없음이다. */
const reasonOf = (effect: Effect.Effect<unknown, ArchiveError>): Promise<ArchiveReason | null> =>
  Effect.runPromise(
    effect.pipe(
      Effect.as(Option.none<ArchiveReason>()),
      Effect.catch((error: ArchiveError) => Effect.succeed(Option.some(error.reason))),
      Effect.map(Option.getOrNull),
    ),
  )

describe('fileFromHandle', () => {
  test('a handle we already may read opens without asking again', async () => {
    const { handle: granted, requestPermission } = handle({ standing: 'granted' })

    const file = await Effect.runPromise(fileFromHandle(granted))

    expect(file.name).toBe('volume-1.cbz')
    expect(requestPermission).not.toHaveBeenCalled()
  })

  test('a handle from an earlier session asks once, and opens when allowed', async () => {
    const { handle: prompting, requestPermission } = handle({
      standing: 'prompt',
      asked: 'granted',
    })

    await Effect.runPromise(fileFromHandle(prompting))

    expect(requestPermission).toHaveBeenCalledTimes(1)
  })

  test('saying no is not a broken book — it is a book we may not read', async () => {
    const { handle: denied } = handle({ standing: 'prompt', asked: 'denied' })

    expect(await reasonOf(fileFromHandle(denied))).toStrictEqual({
      kind: 'noPermission',
      name: 'volume-1.cbz',
    })
  })

  test('a file that moved away says so, rather than failing as unreadable', async () => {
    const { handle: moved } = handle({ standing: 'granted', gone: true })

    expect(await reasonOf(fileFromHandle(moved))).toStrictEqual({
      kind: 'fileGone',
      name: 'volume-1.cbz',
    })
  })
})
