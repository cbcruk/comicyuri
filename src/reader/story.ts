/**
 * 리더의 update를 이야기로 읽는 시험 도구. `foldkit/story`가 하던 일을 옮긴 자리다.
 *
 * Command가 실행되는 값이 아니라 무엇을 해 달라는 말이 되었으므로, 여기서 "답한다"는
 * 것은 그 말을 목록에서 지우고 답에 해당하는 Message를 대신 보내는 일이다. 답하지
 * 않은 Command를 둔 채로는 다음 Message를 보낼 수 없고, 이야기가 끝날 때 남아 있어도
 * 안 된다 — 화면이 하기로 한 일을 잊은 채 이야기가 이어지지 않도록.
 */

import { Array } from 'effect'

import { expect } from 'vite-plus/test'

import type { Command as ReaderCommand } from './command.ts'
import type { Message, OutMessage } from './message.ts'
import type { Model } from './model.ts'
import type { UpdateReturn } from './update/navigation.ts'

/** 이야기가 접어 넣는 함수. 리더의 `update`가 이 모양이다. */
export type Update = (model: Model, message: Message) => UpdateReturn

/** 이야기가 지금까지 이른 자리. */
type Simulation = Readonly<{
  update: Update
  model: Model
  /** 아직 답하지 않은 Command. */
  commands: ReadonlyArray<ReaderCommand>
  /** 가장 마지막 Message가 남긴 OutMessage. */
  outMessage: OutMessage | undefined
}>

/** 이야기의 한 걸음. */
export type Step = (simulation: Simulation) => Simulation

/** 이야기가 시작하는 Model. */
export type Given = Readonly<{ model: Model }>

/** 이야기를 어떤 Model에서 시작할지 정한다. */
export const given = (model: Model): Given => ({ model })

const applied = (simulation: Simulation, sent: Message, pending: ReadonlyArray<ReaderCommand>) => {
  const next = simulation.update(simulation.model, sent)

  return {
    update: simulation.update,
    model: next.model,
    commands: [...pending, ...(next.commands ?? [])],
    outMessage: next.outMessage,
  }
}

/** Message 하나를 보낸다. 답하지 않은 Command가 있으면 보낼 수 없다. */
export const message =
  (sent: Message): Step =>
  (simulation) => {
    expect(
      simulation.commands,
      'There were unanswered Commands when you sent a new Message',
    ).toStrictEqual([])

    return applied(simulation, sent, Array.empty<ReaderCommand>())
  }

/** 지금 Model을 놓고 무엇이든 확인한다. */
export const model =
  (assert: (model: Model) => void): Step =>
  (simulation) => {
    assert(simulation.model)
    return simulation
  }

/** update가 이 OutMessage를 올려 보냈는지. */
export const expectOutMessage =
  (expected: OutMessage): Step =>
  (simulation) => {
    expect(simulation.outMessage).toStrictEqual(expected)
    return simulation
  }

/** update가 아무것도 올려 보내지 않았는지. */
export const expectNoOutMessage = (): Step => (simulation) => {
  expect(simulation.outMessage).toBeUndefined()
  return simulation
}

/** 답하지 않은 Command를 놓고 하는 걸음들. */
export const Command = {
  /**
   * 그 이름의 Command 하나를 답으로 채운다. 목록에서 지우고, 답에 해당하는 Message를
   * 대신 보낸다.
   */
  resolve:
    (name: ReaderCommand['_tag'], result: Message): Step =>
    (simulation) => {
      const at = simulation.commands.findIndex((command) => command._tag === name)

      expect(at, `I tried to answer "${name}" but no such Command was waiting`).toBeGreaterThan(-1)

      return applied(simulation, result, [
        ...simulation.commands.slice(0, at),
        ...simulation.commands.slice(at + 1),
      ])
    },

  /** 적어 둔 Command들이 모두 기다리고 있는지. */
  expectHas:
    (...expected: ReadonlyArray<ReaderCommand>): Step =>
    (simulation) => {
      for (const command of expected) {
        expect(simulation.commands).toContainEqual(command)
      }
      return simulation
    },

  /** 기다리는 Command가 적어 둔 것들뿐인지. */
  expectExact:
    (...expected: ReadonlyArray<ReaderCommand>): Step =>
    (simulation) => {
      expect(simulation.commands).toHaveLength(expected.length)
      for (const command of expected) {
        expect(simulation.commands).toContainEqual(command)
      }
      return simulation
    },
}

/** 이야기를 끝까지 돌린다. 답하지 않은 Command가 남으면 실패한다. */
export const story = (update: Update, start: Given, ...steps: ReadonlyArray<Step>): void => {
  const ended = steps.reduce<Simulation>((simulation, step) => step(simulation), {
    update,
    model: start.model,
    commands: Array.empty<ReaderCommand>(),
    outMessage: undefined,
  })

  expect(ended.commands, 'The story ended with Commands nobody answered').toStrictEqual([])
}
