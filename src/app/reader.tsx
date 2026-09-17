/**
 * 책 한 권을 읽는 자리. 라우터가 부르는 겉면이다.
 *
 * 하는 일은 셋이다. 저장된 자리와 설정을 읽어 리더가 걸 첫 Model을 세우고, 화면을
 * 세우고, 리더가 떠나거나 이웃한 책을 열어 달라고 할 때 라우터를 움직인다. 읽는 일
 * 자체는 `src/app/reader/`의 {@linkcode ReaderView}가 맡는다.
 *
 * 저장된 자리를 안 뒤에 Model을 만드는 것이 이 자리의 요점이다. 그러지 않으면 첫 장을
 * 그렸다가 읽던 자리로 건너뛰는 프레임이 생긴다(`R-2B5`).
 */

import { Option } from 'effect'
import { Atom } from 'effect/unstable/reactivity'
import { useAtomValue } from '@effect/atom-react'
import { useNavigate } from '@tanstack/react-router'

import { Reading } from '../domain/index.ts'
import { init } from '../reader/model.ts'
import type { Model } from '../reader/model.ts'
import { browserPersistence } from './reader/persistence.ts'
import type { ReaderProgress } from './reader/persistence.ts'
import { ReaderView } from './reader/reader.tsx'
import { useDocumentTitle } from './title.ts'

export { ReaderView } from './reader/reader.tsx'
export type { ReaderViewProps } from './reader/reader.tsx'

/** 한 번도 연 적 없는 책이 받는 자리. */
const NEVER_OPENED: ReaderProgress = {
  page: 0,
  bookmarks: [],
  marks: [],
  rotation: 0,
}

/**
 * 저장된 것을 읽어 리더의 첫 Model을 세운다.
 *
 * 구독하지 않고 그 자리에서 한 번만 읽는다(`get.once`). 읽는 동안 설정이 바뀌면 그것은 리더
 * 안의 Model이 이미 쥐고 있으므로, 여기서 다시 읽으면 도리어 읽던 자리가 되감긴다. 그래서
 * 이 atom은 아무것에도 기대지 않고, 한 번 셈한 뒤로는 다시 셈하지 않는다.
 *
 * 수명은 리더 화면과 같다. 화면이 내려가 아무도 구독하지 않으면 레지스트리가 치우므로, 같은
 * 책을 다시 열면 그 사이에 저장된 자리를 새로 읽는다.
 */
const openingModel = Atom.family((bookId: string) =>
  Atom.make((get): Model => {
    const settings = get.once(browserPersistence.settingsAtom)
    const saved = Option.getOrElse(
      get.once(browserPersistence.progressFor(bookId)),
      () => NEVER_OPENED,
    )
    const { page, maybeOffer } = Reading.opening(settings, saved.page)

    return init({
      bookId,
      page,
      maybeResumePage: maybeOffer,
      bookmarks: saved.bookmarks,
      marks: saved.marks,
      rotation: saved.rotation,
      maybeBookSettings: get.once(browserPersistence.bookSettingsFor(bookId)),
      settings,
    })
  }),
)

/** 리더 화면을 세우고 라우터에 잇는다. */
export const ReaderScreen = ({ bookId }: Readonly<{ bookId: string }>) => {
  useDocumentTitle(`comicyuri — ${bookId}`)
  const navigate = useNavigate()
  const initial = useAtomValue(openingModel(bookId))

  return (
    // 이웃한 책으로 건너가면 리더를 새로 세운다(`R-216`). 그 책은 자기 자리에서
    // 시작해야 하므로, 앞 책의 Model을 고쳐 쓰는 것이 아니라 처음부터 여는 것이다.
    <ReaderView
      key={bookId}
      initial={initial}
      onExit={() => void navigate({ to: '/' })}
      onOpenBook={(id) => void navigate({ to: '/book/$id', params: { id } })}
    />
  )
}
