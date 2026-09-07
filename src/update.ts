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
  LoadShelf,
  NavigateInternal,
  RevokeCoverUrls,
  SaveSettings,
  SelectFiles,
  SelectFolder,
  WaitBeforeClearingNotice,
} from './command.ts'
import { Book } from './domain/index.ts'
import { Message } from './message.ts'
import { Model, Notice, Shelf } from './model.ts'
import { urlToAppRoute } from './route.ts'
import type { Theme } from './types.ts'

type UpdateReturn = Update.Return<Model, Message>

/**
 * Shows a failure and starts the wait that clears it, cancelling any wait a
 * previous failure left running so this message gets its full time on screen.
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

/** Reloads the shelf, keeping the books on screen while it runs. */
const reloadShelf = (model: Model): UpdateReturn => ({
  model: evo(model, {
    shelf: (shelf) => Option.getOrElse(AsyncData.revalidate(shelf), () => Shelf.Loading()),
  }),
  commands: [LoadShelf()],
})

const foldFileDropOutMessage = FileDrop.OutMessage.match<Update.Step<Model, Message>>({
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

    ChangedUrl: ({ url }) => ({
      model: evo(model, { route: () => urlToAppRoute(url) }),
    }),

    SucceededLoadShelf: ({ books }) => ({
      model: evo(model, { shelf: () => Shelf.Success({ data: books }) }),
      // The covers from the previous load are unreachable now that the new
      // ones are in the Model.
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

    SucceededImportFiles: () => reloadShelf(model),

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

    // Only the wait started for the message currently on screen may clear it.
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
