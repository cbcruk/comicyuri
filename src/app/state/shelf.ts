/**
 * 책장 순서를 아는 자리. 책의 끝을 넘겼을 때 어느 책이 이웃인지 여기서 묻는다(`R-216`).
 *
 * Foldkit에서는 Model이 쥔 책장을 보고 root의 update가 답했다. 순서를 정하는 것은
 * 그때나 지금이나 저장 계층이다(`S-102`).
 */

import { Effect, Option } from 'effect'

import { Book } from '../../domain/index.ts'
import { getAllBooks } from '../../io/db.ts'

/**
 * 책장 순서에서 이웃한 책. 앞으로 한 칸이면 `1`, 뒤로 한 칸이면 `-1`이다.
 *
 * 책장의 끝을 넘어가면 없음이다. 책장을 읽지 못했을 때도 없음인데, 순서를 모르는
 * 채로 짐작해 여는 것보다 제자리에 머무는 편이 낫기 때문이다(`R-216`).
 *
 * @returns 이웃한 책의 id. 없으면 리더는 있던 자리에 그대로 있는다.
 */
export const neighbourBookId = (
  bookId: string,
  step: number,
): Effect.Effect<Option.Option<string>> =>
  getAllBooks.pipe(
    Effect.map((records) =>
      Option.map(
        Book.neighbour(
          records.map((record) => Book.fromRecord(record, Option.none())),
          bookId,
          step,
        ),
        (book) => book.id,
      ),
    ),
    Effect.orElseSucceed(() => Option.none<string>()),
  )
