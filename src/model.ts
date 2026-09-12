import { Schema } from 'effect'
import { AsyncData } from 'foldkit'
import { defineTaggedUnion } from 'foldkit/schema'

import { FileDrop } from '@foldkit/ui'

import { BookSummary } from './domain/book.ts'
import { Reader } from './page/index.ts'
import { AppRoute } from './route.ts'
import { Settings } from './types.ts'

/**
 * 책장은 원격 데이터라서 읽는 중과 실패 상태를 스스로 지고 다닌다. 핵심은
 * `Refreshing`이다. 임포트나 삭제 뒤에 다시 읽을 때 격자를 비우지 않고 이미
 * 화면에 있는 책들을 남겨 둔다.
 */
export const Shelf = AsyncData.Schema(Schema.Array(BookSummary), Schema.String)

/** {@linkcode Shelf} 스키마의 디코딩된 값. */
export type Shelf = typeof Shelf.schema.Type

/**
 * 사람이 시작한 작업에 대해 상태 줄이 하는 말. 임포트가 돌고 있거나, 실패했거나.
 * 책장 자체의 읽기 상태와는 다르며 그쪽은 `shelf`에 있다.
 */
export const Notice = defineTaggedUnion({
  Idle: {},
  Busy: { text: Schema.String },
  /**
   * `token`은 이 메시지를 위해 시작된 대기를 가리킨다. 앞선 실패가 시작한 대기는
   * 더 오래된 토큰을 들고 있어서 도착해도 무시되므로, 더 새로운 메시지를 잘라
   * 먹지 못한다.
   */
  Failed: { text: Schema.String, token: Schema.Number },
})

/** {@linkcode Notice} 유니온의 디코딩된 값. */
export type Notice = typeof Notice.Type

/** 애플리케이션이 아는 전부이자, 뷰가 읽는 유일한 것. */
export const Model = Schema.Struct({
  route: AppRoute,
  settings: Settings,
  shelf: Shelf.schema,
  notice: Notice,
  fileDrop: FileDrop.Model,
  /**
   * 지울지 묻고 있는 책. 묻는 중이 아니면 없음이다.
   *
   * 지우는 것은 되돌릴 수 없고 그 책의 읽던 자리까지 함께 간다. 그래서 🗑은
   * 지우는 버튼이 아니라 묻는 버튼이고, 실제로 지우는 것은 그 답이다.
   */
  maybePendingDelete: Schema.Option(Schema.String),
  /** 리더 라우트가 열려 있는 동안에만 있다. */
  maybeReader: Schema.Option(Reader.Model),
})

/** {@linkcode Model} 스키마의 디코딩된 값. */
export type Model = typeof Model.Type
