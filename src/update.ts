import { Array, Option } from 'effect'
import { AsyncData, Update } from 'foldkit'
import { UrlRequest } from 'foldkit/navigation'
import { evo } from 'foldkit/struct'
import { toString as urlToString } from 'foldkit/url'

import { FileDrop } from '@foldkit/ui'

import {
  ApplyTheme,
  DeleteBook,
  ImportFiles,
  LoadExternal,
  LoadProgress,
  LoadShelf,
  NavigateInternal,
  RevokeCoverUrls,
  SaveBookSettings,
  SaveProgress,
  SaveSettings,
  SelectFiles,
  SelectFolder,
  WaitBeforeClearingNotice,
} from './command.ts'
import { Book, Reading } from './domain/index.ts'
import { Message } from './message.ts'
import { Model, Notice, Shelf } from './model.ts'
import { Reader } from './page/index.ts'
import { AppRoute, readerRouter, shelfRouter, urlToAppRoute } from './route.ts'
import { nudgedSlideSeconds, nudgedThreshold } from './settings.ts'
import type { Settings, Theme } from './types.ts'

type UpdateReturn = Update.Return<Model, Message, Reader.OpenBookService>

/**
 * 실패를 띄우고 그것을 지울 대기를 시작한다. 앞선 실패가 남겨 둔 대기는
 * 무효로 만들어, 이 메시지가 화면에 제 시간을 온전히 쓰도록 한다.
 */
const failed = (model: Model, text: string): UpdateReturn => {
  const token = Notice.match(model.notice, {
    Idle: () => 0,
    Busy: () => 0,
    Failed: ({ token }) => token + 1,
  })

  return {
    model: evo(model, { notice: () => Notice.Failed({ text, token }) }),
    commands: [WaitBeforeClearingNotice({ token })],
  }
}

const startImport = (model: Model, files: ReadonlyArray<File>): UpdateReturn => ({
  model: evo(model, { notice: () => Notice.Busy({ text: 'Importing…' }) }),
  commands: [ImportFiles({ files })],
})

/**
 * 상태 줄이 알리고 있던 작업을 끝낸다. 그사이 도착한 실패는 이제 그 줄의
 * 주인이므로 자기 대기에 맡겨 둔다.
 */
const withOperationEnded = (model: Model): Model =>
  Notice.match(model.notice, {
    Idle: () => model,
    Failed: () => model,
    Busy: () => evo(model, { notice: () => Notice.Idle() }),
  })

/**
 * 책장에서 바꾼 설정은 전역 기본값 그대로다.
 *
 * 여기에는 책이 없으므로 가를 것이 없다. 리더에서 바꾼 것은 책별 몫으로
 * 갈리지만(`Reading.split`), 책장에서 바꾼 것은 모든 책의 기본값이다.
 */
const withSettings = (model: Model, settings: Settings): UpdateReturn => ({
  model: evo(model, { settings: () => settings }),
  commands: [SaveSettings({ settings })],
})

/** 지금 화면에 걸려 있는 표지들. 다시 읽어도 그대로 쓰이도록 넘겨 준다. */
const coversOnScreen = (model: Model): ReadonlyArray<Book.Cover> =>
  Book.coversOf(Option.getOrElse(AsyncData.getData(model.shelf), Array.empty))

/** 책장을 다시 읽는다. 읽는 동안 화면의 책들은 그대로 둔다. */
const reloadShelf = (model: Model): UpdateReturn => ({
  model: evo(model, {
    shelf: (shelf) => Option.getOrElse(AsyncData.revalidate(shelf), () => Shelf.Loading()),
  }),
  commands: [LoadShelf({ have: coversOnScreen(model) })],
})

const foldFileDropOutMessage = FileDrop.OutMessage.match<
  Update.Step<Model, Message, Reader.OpenBookService>
>({
  ReceivedFiles:
    ({ files }) =>
    (model) =>
      startImport(model, files),
  RejectedNonFiles: () => (model) => failed(model, 'Only files can be dropped here'),
})

const foldFileDrop = Update.foldChild({
  update: FileDrop.update,
  read: (model: Model) => Option.some(model.fileDrop),
  write: (model, nextFileDrop) => evo(model, { fileDrop: () => nextFileDrop }),
  toParentMessage: (message) => Message.GotFileDropMessage({ message }),
  foldOutMessage: foldFileDropOutMessage,
})

const foldReaderOutMessage = Reader.OutMessage.match<
  Update.Step<Model, Message, Reader.OpenBookService>
>({
  RequestedExit: () => (model) => ({
    model,
    commands: [NavigateInternal({ url: shelfRouter() })],
  }),
  /**
   * 책장 순서를 아는 것은 여기다. 이웃한 책이 없으면 — 책장의 끝이거나 아직
   * 책장을 읽는 중이라면 — 아무 일도 일어나지 않고, 리더는 제자리에 머문다.
   */
  RequestedNeighbourBook:
    ({ bookId, step }) =>
    (model) =>
      Option.match(
        Option.flatMap(AsyncData.getData(model.shelf), (books) =>
          Book.neighbour(books, bookId, step),
        ),
        {
          onNone: () => ({ model }),
          onSome: (book) => ({
            model,
            commands: [NavigateInternal({ url: readerRouter(book.id) })],
          }),
        },
      ),
  /**
   * 리더가 쥔 설정은 전역 기본값과 이 책의 것을 합친 결과다. 저장할 때 다시
   * 갈라야, 어떤 책에서 뒤집은 방향이 전역 기본값이 되어 다음 책까지 따라가지
   * 않는다.
   */
  ChangedSettings:
    ({ bookId, settings }) =>
    (model) => {
      const { global, maybeBook } = Reading.split(model.settings, settings)

      return {
        model: evo(model, { settings: () => global }),
        commands: [
          SaveSettings({ settings: global }),
          SaveBookSettings({ bookId, maybeSettings: maybeBook }),
        ],
      }
    },
  UpdatedProgress:
    ({ bookId, page, bookmarks, marks, rotation }) =>
    (model) => ({
      model,
      commands: [SaveProgress({ bookId, page, bookmarks, marks, rotation })],
    }),
})

const foldReader = Update.foldChild({
  update: Reader.update,
  read: (model: Model) => model.maybeReader,
  write: (model, nextReader) => evo(model, { maybeReader: () => Option.some(nextReader) }),
  toParentMessage: (message) => Message.GotReaderMessage({ message }),
  foldOutMessage: foldReaderOutMessage,
})

/**
 * Message 하나를 Model에 접어 넣고, 다음 Model과 이어서 일어날 일을 함께
 * 돌려준다.
 */
export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedLink: ({ request }) =>
      UrlRequest.match<UpdateReturn>(request, {
        Internal: ({ url }) => ({
          model,
          commands: [NavigateInternal({ url: urlToString(url) })],
        }),
        External: ({ href }) => ({
          model,
          commands: [LoadExternal({ href })],
        }),
      }),

    ChangedUrl: ({ url }) => {
      const route = urlToAppRoute(url)
      // 자리를 옮기면 묻던 것도 접는다. 화면에 없는 카드의 물음이 남아 있다가
      // 책장에 돌아왔을 때 다시 떠 있어서는 안 된다.
      const routed = evo(model, {
        route: () => route,
        maybePendingDelete: () => Option.none<string>(),
      })

      return AppRoute.match(route, {
        Reader: ({ id }) =>
          // 저장된 위치를 안 뒤에 리더를 만든다. 그래야 1페이지를 그렸다가
          // 건너뛰는 일이 없다.
          Option.exists(model.maybeReader, (reader) => reader.bookId === id)
            ? { model: routed }
            : {
                model: evo(routed, { maybeReader: () => Option.none() }),
                commands: [LoadProgress({ bookId: id })],
              },
        Shelf: () => ({
          model: evo(routed, { maybeReader: () => Option.none() }),
        }),
        NotFound: () => ({
          model: evo(routed, { maybeReader: () => Option.none() }),
        }),
      })
    },

    CompletedLoadProgress: ({ bookId, page, bookmarks, marks, rotation, maybeSettings }) =>
      // 이미 떠난 책에 대한 늦은 답은 버린다.
      AppRoute.match(model.route, {
        Reader: ({ id }) => {
          if (id !== bookId) return { model }

          // 저장된 자리로 곧장 갈지, 처음부터 볼지, 물어볼지는 설정이 정한다.
          const opening = Reading.opening(model.settings, page)

          return {
            model: evo(model, {
              maybeReader: () =>
                Option.some(
                  Reader.init({
                    bookId,
                    page: opening.page,
                    maybeResumePage: opening.maybeOffer,
                    bookmarks,
                    marks,
                    rotation,
                    maybeBookSettings: maybeSettings,
                    settings: model.settings,
                  }),
                ),
            }),
          }
        },
        Shelf: () => ({ model }),
        NotFound: () => ({ model }),
      }),

    GotReaderMessage: ({ message }) => foldReader(model, message),

    CompletedSaveProgress: () => ({ model }),

    CompletedSaveBookSettings: () => ({ model }),

    SucceededLoadShelf: ({ books }) => ({
      model: evo(model, {
        shelf: () => Shelf.Success({ data: books }),
        // 방금 읽은 책장에 없는 책을 두고 묻고 있을 수는 없다.
        maybePendingDelete: (pending) =>
          Option.filter(pending, (id) => Array.some(books, (book) => book.id === id)),
      }),
      // 새 책장이 밀어낸 표지만 놓아 준다. 그대로 남은 책의 표지는 같은 URL을
      // 계속 쥐고 있으므로 카드가 다시 그려지지 않는다.
      commands: [
        RevokeCoverUrls({
          urls: Book.droppedCoverUrls(
            Option.getOrElse(AsyncData.getData(model.shelf), Array.empty),
            books,
          ),
        }),
      ],
    }),

    FailedLoadShelf: ({ text }) => ({
      model: evo(model, {
        shelf: (shelf) =>
          Option.match(AsyncData.getData(shelf), {
            onNone: () => Shelf.Failure({ error: text }),
            onSome: (data) => Shelf.Stale({ error: text, data }),
          }),
      }),
    }),

    GotFileDropMessage: ({ message }) => foldFileDrop(model, message),

    ClickedOpenFiles: () => ({ model, commands: [SelectFiles()] }),

    ClickedOpenFolder: () => ({ model, commands: [SelectFolder()] }),

    CompletedSelectFiles: ({ files }) =>
      Array.match(files, {
        onEmpty: () => ({ model }),
        onNonEmpty: (files) => startImport(model, files),
      }),

    SucceededImportFiles: () => reloadShelf(withOperationEnded(model)),

    FailedImportFiles: ({ text }) => failed(model, text),

    /**
     * 지우는 것이 아니라 지울지 묻는다. 지운 책은 되돌아오지 않고 읽던 자리도
     * 함께 가는데, 🗑은 카드 위에 떠 있어서 책을 누르려다 스칠 수 있다.
     */
    ClickedDeleteBook: ({ id }) => ({
      model: evo(model, { maybePendingDelete: () => Option.some(id) }),
    }),

    ClickedConfirmDeleteBook: ({ id }) => ({
      model: evo(model, { maybePendingDelete: () => Option.none<string>() }),
      commands: [DeleteBook({ id })],
    }),

    ClickedCancelDeleteBook: () => ({
      model: evo(model, { maybePendingDelete: () => Option.none<string>() }),
    }),

    SucceededDeleteBook: () => reloadShelf(model),

    FailedDeleteBook: ({ text }) => failed(model, text),

    ClickedToggleTheme: () => {
      const theme: Theme = model.settings.theme === 'dark' ? 'light' : 'dark'
      const settings = evo(model.settings, { theme: () => theme })

      return {
        model: evo(model, { settings: () => settings }),
        commands: [SaveSettings({ settings }), ApplyTheme({ theme })],
      }
    },

    ClickedToggleSettings: () => ({
      model: evo(model, { isSettingsOpen: (isOpen) => !isOpen }),
    }),

    ToggledCoverAlone: ({ isChecked }) =>
      withSettings(model, evo(model.settings, { coverAlone: () => isChecked })),

    ToggledEnlargeToFit: ({ isChecked }) =>
      withSettings(model, evo(model.settings, { enlargeToFit: () => isChecked })),

    ToggledSplitWide: ({ isChecked }) =>
      withSettings(model, evo(model.settings, { splitWide: () => isChecked })),

    ToggledRememberBookSettings: ({ isChecked }) =>
      withSettings(model, evo(model.settings, { rememberBookSettings: () => isChecked })),

    SelectedAtBookEnd: ({ atBookEnd }) =>
      withSettings(model, evo(model.settings, { atBookEnd: () => atBookEnd })),

    SelectedResume: ({ resume }) =>
      withSettings(model, evo(model.settings, { resume: () => resume })),

    ClickedNudgeThreshold: ({ by }) =>
      withSettings(
        model,
        evo(model.settings, { singleThreshold: (threshold) => nudgedThreshold(threshold, by) }),
      ),

    ClickedNudgeSlideSeconds: ({ by }) =>
      withSettings(
        model,
        evo(model.settings, { slideSeconds: (seconds) => nudgedSlideSeconds(seconds, by) }),
      ),

    // 지금 화면에 떠 있는 메시지를 위해 시작된 대기만 그것을 지울 수 있다.
    CompletedWaitBeforeClearingNotice: ({ token }) =>
      Notice.match(model.notice, {
        Idle: () => ({ model }),
        Busy: () => ({ model }),
        Failed: (notice) =>
          notice.token === token
            ? { model: evo(model, { notice: () => Notice.Idle() }) }
            : { model },
      }),

    CompletedNavigateInternal: () => ({ model }),
    CompletedLoadExternal: () => ({ model }),
    CompletedSaveSettings: () => ({ model }),
    CompletedApplyTheme: () => ({ model }),
    CompletedRevokeCoverUrls: () => ({ model }),
  })
