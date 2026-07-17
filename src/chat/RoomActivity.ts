import { nanoid } from 'nanoid'
import type { OfficeSocket } from '../net/OfficeSocket'
import type { ServerMsg } from '../../shared/protocol'

export type HandEvent = {
  type: 'hand'
  roomId: string
  fromId: string
  fromName: string
  raised: boolean
  at: number
}

export type PollCreateEvent = {
  type: 'poll-create'
  roomId: string
  poll: Poll
}

export type PollVoteEvent = {
  type: 'poll-vote'
  roomId: string
  pollId: string
  fromId: string
  optionIndex: number
  at: number
}

export type EmojiEvent = {
  type: 'emoji'
  roomId: string
  fromId: string
  fromName: string
  emoji: string
  at: number
  /** 0–1 spawn position for variety */
  x: number
}

export type ActivityEvent = HandEvent | PollCreateEvent | PollVoteEvent | EmojiEvent

export interface Poll {
  id: string
  question: string
  options: string[]
  createdBy: string
  createdByName: string
  at: number
  /** fromId → optionIndex */
  votes: Record<string, number>
}

export class RoomActivityBus {
  private selfId: string
  private net: OfficeSocket
  private listeners = new Set<(ev: ActivityEvent) => void>()
  private unsub: () => void

  constructor(net: OfficeSocket, selfId: string) {
    this.net = net
    this.selfId = selfId
    this.unsub = net.subscribe((msg) => this.onServer(msg))
  }

  private onServer(msg: ServerMsg) {
    if (msg.type !== 'activity') return
    const data = msg.event
    if (data.type === 'poll-create') {
      if (data.poll.createdBy === this.selfId) return
    } else if (data.fromId === this.selfId) {
      return
    }
    this.listeners.forEach((fn) => fn(data))
  }

  publish(ev: ActivityEvent) {
    this.net.send({ type: 'activity', event: ev })
    this.listeners.forEach((fn) => fn(ev))
  }

  raiseHand(roomId: string, fromName: string, raised: boolean) {
    this.publish({
      type: 'hand',
      roomId,
      fromId: this.selfId,
      fromName,
      raised,
      at: Date.now(),
    })
  }

  createPoll(roomId: string, fromName: string, question: string, options: string[]) {
    const poll: Poll = {
      id: nanoid(8),
      question: question.trim(),
      options: options.map((o) => o.trim()).filter(Boolean),
      createdBy: this.selfId,
      createdByName: fromName,
      at: Date.now(),
      votes: {},
    }
    if (poll.options.length < 2) return null
    this.publish({ type: 'poll-create', roomId, poll })
    return poll
  }

  votePoll(roomId: string, pollId: string, optionIndex: number) {
    this.publish({
      type: 'poll-vote',
      roomId,
      pollId,
      fromId: this.selfId,
      optionIndex,
      at: Date.now(),
    })
  }

  sendEmoji(roomId: string, fromName: string, emoji: string) {
    this.publish({
      type: 'emoji',
      roomId,
      fromId: this.selfId,
      fromName,
      emoji,
      at: Date.now(),
      x: 0.15 + Math.random() * 0.7,
    })
  }

  subscribe(fn: (ev: ActivityEvent) => void) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  destroy() {
    this.unsub()
    this.listeners.clear()
  }
}

export const FLOAT_EMOJIS = ['👍', '👏', '❤️', '😂', '🔥', '🎉', '😮', '🙌']
