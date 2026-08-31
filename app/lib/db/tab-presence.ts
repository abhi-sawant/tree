// Two tabs on one IndexedDB is not a hypothetical: people open a second tab to
// look something up and leave it there for a week. Dexie's liveQuery keeps both
// tabs' *reads* in step, so ordinary editing is safe. Two things are not:
//
// 1. A restore — a snapshot rollback or a backup import — replaces the entire
//    database. The other tab is then showing people who no longer exist, and its
//    next edit writes them back.
// 2. Both tabs running the same automatic backup work, duplicating the most
//    expensive thing the app does.
//
// This module is the pure core of the answer: presence tracking and a leader
// election over an injected message channel, driven entirely by messages and an
// explicit clock so it can be tested without timers or a real BroadcastChannel.

export const HEARTBEAT_MS = 5_000

// Three missed beats. A tab that is force-quit or crashes never gets to say
// goodbye, and a peer that lingers for ever would stop this tab from ever
// becoming leader — so presence expires rather than relying on the farewell.
export const PEER_TIMEOUT_MS = 15_000

// A tab that has just opened has not heard from anyone yet, and would otherwise
// declare itself leader for one heartbeat while another tab already is one.
// Long enough for a round trip, short enough to be invisible.
export const JOIN_GRACE_MS = 1_500

export type TabMessageKind = "ping" | "bye" | "replaced"

export interface TabMessage {
  kind: TabMessageKind
  id: string
}

export function isTabMessage(value: unknown): value is TabMessage {
  if (typeof value !== "object" || value === null) return false
  const message = value as Record<string, unknown>
  return (
    typeof message.id === "string" &&
    (message.kind === "ping" ||
      message.kind === "bye" ||
      message.kind === "replaced")
  )
}

export interface ReceiveResult {
  // A peer we hadn't heard from before. The caller answers with its own ping so
  // discovery takes one round trip rather than one heartbeat.
  isNewPeer: boolean
  // Another tab replaced the whole database. Everything this tab is showing is
  // now stale.
  replaced: boolean
}

export interface TabPresenceOptions {
  id: string
  startedAt: number
  peerTimeoutMs?: number
  joinGraceMs?: number
}

export interface TabPresence {
  readonly id: string
  receive: (raw: unknown, now: number) => ReceiveResult
  peerIds: (now: number) => string[]
  isLeader: (now: number) => boolean
  forget: (id: string) => void
}

const IGNORED: ReceiveResult = { isNewPeer: false, replaced: false }

export function createTabPresence(options: TabPresenceOptions): TabPresence {
  const {
    id,
    startedAt,
    peerTimeoutMs = PEER_TIMEOUT_MS,
    joinGraceMs = JOIN_GRACE_MS,
  } = options

  const lastSeen = new Map<string, number>()

  function live(now: number): string[] {
    const alive: string[] = []
    for (const [peerId, seen] of lastSeen) {
      // A `seen` in the future means the peer's clock is ahead of ours. Treating
      // it as live is the safe reading: wrongly dropping a peer costs the
      // duplicate-work protection this exists to provide.
      if (seen > now || now - seen < peerTimeoutMs) alive.push(peerId)
      else lastSeen.delete(peerId)
    }
    return alive.sort()
  }

  return {
    id,

    receive(raw, now) {
      if (!isTabMessage(raw)) return IGNORED
      // BroadcastChannel doesn't deliver to the sender, but a caller could wire
      // it up so it did, and a tab that counted itself as a peer would never be
      // leader.
      if (raw.id === id) return IGNORED

      if (raw.kind === "bye") {
        lastSeen.delete(raw.id)
        return IGNORED
      }

      const isNewPeer = !lastSeen.has(raw.id)
      lastSeen.set(raw.id, now)
      return { isNewPeer, replaced: raw.kind === "replaced" }
    },

    peerIds: live,

    // Lowest id wins. Any total order would do; what matters is that every tab
    // computes the same answer from the same set without needing a negotiation
    // protocol. Ids are UUIDs, so the winner is arbitrary but stable.
    isLeader(now) {
      // Held back until this tab has had a chance to hear from the others.
      if (now - startedAt < joinGraceMs) return false
      const peers = live(now)
      return peers.every((peerId) => id < peerId)
    },

    forget(peerId) {
      lastSeen.delete(peerId)
    },
  }
}
