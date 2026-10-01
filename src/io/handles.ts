/**
 * 디스크 위의 파일을 가리키는 손잡이(`FileSystemFileHandle`)로 책을 고르는 길(`S-122`).
 *
 * 손잡이를 책장에 남기면 바이트를 복사하지 않아도 된다. 1GB 폴더를 들여와도 책장 레코드는
 * 손잡이와 메타데이터뿐이고, 새로고침을 넘겨도 같은 파일을 다시 연다.
 *
 * 이 길은 Chromium에만 있다. `showOpenFilePicker`·`showDirectoryPicker`와 권한을 묻는
 * `queryPermission`·`requestPermission`이 Firefox와 Safari에는 없다. 그래서 여기 있는 것은
 * 모두 "있으면 쓴다"이고, 없으면 부르는 쪽이 지금까지의 복사 길로 간다.
 *
 * 타입도 그래서 여기서 짓는다. `FileSystemFileHandle`은 lib.dom에 있지만 선택기와 권한
 * 메서드는 없다 — 표준이 아닌 자리라는 사실이 타입에 그대로 드러나는 편이 낫다.
 */

import { Effect } from 'effect'

import { ArchiveError } from '../errors.ts'
import { isArchiveName, isImageName } from './loader.ts'
import type { PickedFile } from './loader.ts'

/** 선택기가 받는 것 가운데 이 앱이 쓰는 것만. */
type OpenFilePickerOptions = Readonly<{
  multiple?: boolean
  types?: ReadonlyArray<
    Readonly<{ description?: string; accept: Readonly<Record<string, ReadonlyArray<string>>> }>
  >
}>

/** 손잡이를 주는 선택기를 가진 창. Chromium이 아니면 둘 다 없다. */
type PickerWindow = Window &
  Readonly<{
    showOpenFilePicker?: (
      options?: OpenFilePickerOptions,
    ) => Promise<ReadonlyArray<FileSystemFileHandle>>
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
  }>

/** 권한을 묻고 받을 수 있는 손잡이. 같은 이유로 선택적이다. */
type PermissionCapable = Readonly<{
  queryPermission?: (descriptor: Readonly<{ mode: 'read' }>) => Promise<PermissionState>
  requestPermission?: (descriptor: Readonly<{ mode: 'read' }>) => Promise<PermissionState>
}>

/**
 * 선택기를 가진 창. 더하는 속성이 모두 선택적이라 대입만으로 좁혀진다 — 없는 브라우저에서는
 * 그 자리가 `undefined`일 뿐이다.
 */
const picker = (): PickerWindow => window

/** 사용자가 고른 파일을 손잡이로 받을 수 있는 브라우저인지(`S-122`). */
export const supportsHandles = (): boolean =>
  typeof window !== 'undefined' && typeof picker().showOpenFilePicker === 'function'

/**
 * 손잡이가 가리키는 파일을 연다.
 *
 * 허락이 없으면 묻고, 그래도 아니면 실패한다. 묻는 일은 사용자가 방금 누른 것이 있어야
 * 하므로, 부르는 쪽은 이것을 누름에서 이어지는 길 위에 두어야 한다.
 */
export const fileFromHandle = (handle: FileSystemFileHandle): Effect.Effect<File, ArchiveError> =>
  Effect.gen(function* () {
    yield* ensurePermission(handle)

    return yield* Effect.tryPromise({
      try: () => handle.getFile(),
      // 손잡이는 남아 있는데 파일이 없다 — 옮겼거나 지웠다.
      catch: (cause) =>
        new ArchiveError({ reason: { kind: 'fileGone', name: handle.name }, cause }),
    })
  })

/** 읽을 허락이 있는지 보고, 없으면 한 번 묻는다. */
const ensurePermission = (handle: FileSystemFileHandle): Effect.Effect<void, ArchiveError> =>
  Effect.gen(function* () {
    const asking: FileSystemFileHandle & PermissionCapable = handle
    const query = asking.queryPermission
    const request = asking.requestPermission
    // 권한 메서드가 없는 브라우저에는 손잡이를 주는 선택기도 없다. 그래도 레코드가 손잡이를
    // 지고 있다면 다른 브라우저에서 들여온 것이므로, 열어 보고 되는지로 가른다.
    if (query === undefined || request === undefined) return

    const refused = new ArchiveError({ reason: { kind: 'noPermission', name: handle.name } })

    const standing = yield* Effect.tryPromise({
      try: () => query.call(asking, { mode: 'read' }),
      catch: () => refused,
    })
    if (standing === 'granted') return

    // 묻는 일은 방금 누른 것이 있어야 한다. 새로고침처럼 누름 없이 열리는 길에서는 묻지도
    // 못하고 거절되므로, 그것도 "허락이 없다"로 받는다 — 결함으로 두면 리더가 까닭을 잃는다.
    const asked = yield* Effect.tryPromise({
      try: () => request.call(asking, { mode: 'read' }),
      catch: () => refused,
    })
    if (asked !== 'granted') return yield* refused
  })

/** 선택기가 거른 뒤에도 쓸 수 없는 것이 섞여 올 수 있다. 페이지가 될 수 있는 것만 남긴다. */
const isBookFile = (name: string): boolean => isArchiveName(name) || isImageName(name)

/** 손잡이 하나를 {@linkcode PickedFile}로. 경로는 폴더 안에서의 자리다. */
const pickedFrom = (
  handle: FileSystemFileHandle,
  path: string,
): Effect.Effect<PickedFile, ArchiveError> =>
  Effect.map(fileFromHandle(handle), (file) => ({ file, path, handle }))

/**
 * 아카이브와 낱장 이미지를 고르는 선택기(`S-112`). 고르지 않고 닫으면 빈 목록이다.
 */
export const pickFilesWithHandles: Effect.Effect<
  ReadonlyArray<PickedFile>,
  ArchiveError
> = Effect.gen(function* () {
  const open = picker().showOpenFilePicker
  if (open === undefined) return []

  const handles = yield* Effect.tryPromise({
    try: () =>
      open({
        multiple: true,
        types: [
          {
            description: 'Comics and images',
            accept: {
              'application/vnd.comicbook+zip': ['.cbz'],
              'application/zip': ['.zip'],
              'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp'],
            },
          },
        ],
      }),
    // 취소는 실패가 아니라 빈 목록이다(`S-118`). 선택기는 그것도 거절로 알린다.
    catch: () => ABORTED,
  }).pipe(Effect.orElseSucceed(() => []))

  return yield* Effect.forEach(handles, (handle) => pickedFrom(handle, handle.name))
})

/**
 * 폴더를 고르는 선택기(`S-113`). 안쪽 폴더까지 내려가며 페이지가 될 파일을 모은다.
 *
 * 경로는 고른 폴더 이름부터 시작한다. 지금의 `webkitRelativePath`와 같은 모양이라 책 제목과
 * 페이지 순서를 정하는 규칙(`S-114`)이 그대로 쓰인다.
 */
export const pickFolderWithHandles: Effect.Effect<
  ReadonlyArray<PickedFile>,
  ArchiveError
> = Effect.gen(function* () {
  const open = picker().showDirectoryPicker
  if (open === undefined) return []

  const root = yield* Effect.tryPromise({ try: () => open(), catch: () => ABORTED }).pipe(
    Effect.orElseSucceed(() => null),
  )
  if (root === null) return []

  return yield* walk(root, root.name)
})

/** 취소를 실패와 가르는 표. 둘 다 거절로 오므로 값으로 구별한다. */
const ABORTED = Symbol('aborted')

/** 폴더가 내주는 손잡이들. 비동기 이터러블이라 한 번에 모아 둔다. */
const collect = async (
  directory: FileSystemDirectoryHandle,
): Promise<ReadonlyArray<FileSystemDirectoryHandle | FileSystemFileHandle>> => {
  const entries: Array<FileSystemDirectoryHandle | FileSystemFileHandle> = []
  for await (const entry of directory.values()) entries.push(entry)
  return entries
}

/** 폴더 하나를 훑어 그 아래의 책 파일을 모두 모은다. */
const walk = (
  directory: FileSystemDirectoryHandle,
  path: string,
): Effect.Effect<ReadonlyArray<PickedFile>, ArchiveError> =>
  Effect.gen(function* () {
    const entries = yield* Effect.promise(() => collect(directory))
    const picked: PickedFile[] = []

    for (const entry of entries) {
      const here = `${path}/${entry.name}`
      if (entry.kind === 'directory') {
        picked.push(...(yield* walk(entry, here)))
      } else if (isBookFile(entry.name)) {
        picked.push(yield* pickedFrom(entry, here))
      }
    }

    return picked
  })
