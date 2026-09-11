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
import type { Theme } from './types.ts'

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

/** 책장을 다시 읽는다. 읽는 동안 화면의 책들은 그대로 둔다. */
const reloadShelf = (model: Model): UpdateReturn => ({
  model: evo(model, {
    shelf: (shelf) => Option.getOrElse(AsyncData.revalidate(shelf), () => Shelf.Loading()),
  }),
  commands: [LoadShelf()],
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
      const routed = evo(model, { route: () => route })

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
      model: evo(model, { shelf: () => Shelf.Success({ data: books }) }),
      // 새 표지가 Model에 들어왔으니 앞서 읽은 표지들에는 이제 닿을 수 없다.
      commands: [
        RevokeCoverUrls({
          urls: Book.coverUrls(AsyncData.getData(model.shelf).pipe(Option.getOrElse(Array.empty))),
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

    ClickedDeleteBook: ({ id }) => ({ model, commands: [DeleteBook({ id })] }),

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
