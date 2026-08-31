import { useEffect, useState } from "react"

import {
  HEARTBEAT_MS,
  JOIN_GRACE_MS,
  createTabPresence,
  type TabMessage,
} from "~/lib/db/tab-presence"

const CHANNEL_NAME = "familytree:tabs"

// Module-level so announceDataReplaced can post from a restore handler deep in
// the UI without that code having to reach the hook's channel. Created lazily,
// because a browser without BroadcastChannel must degrade to "this is the only
// tab" rather than throwing at import time.
let channel: BroadcastChannel | undefined
let channelUnavailable = false

function getChannel(): BroadcastChannel | undefined {
  if (channel || channelUnavailable) return channel
  if (typeof BroadcastChannel === "undefined") {
    channelUnavailable = true
    return undefined
  }
  channel = new BroadcastChannel(CHANNEL_NAME)
  return channel
}

function post(message: TabMessage): void {
  try {
    getChannel()?.postMessage(message)
  } catch {
    // A channel closed by a page teardown races with the pagehide handler that
    // posts the farewell. Losing that message only costs the other tabs one
    // peer timeout.
  }
}

// Called after a restore has replaced the whole database, so every other tab
// learns that what it is showing no longer exists. Exported separately from the
// hook because the restore happens in Settings and in the snapshots panel, and
// neither should have to hold a channel to say so.
export function announceDataReplaced(tabId: string): void {
  post({ kind: "replaced", id: tabId })
}

export interface TabPresenceState {
  // This tab's id, needed to announce a restore.
  tabId: string
  peerCount: number
  // Only the leader runs the automatic backup work, so two tabs don't both
  // deflate every photo. A browser without BroadcastChannel always leads,
  // because it can never learn about anyone else.
  isLeader: boolean
  // Another tab replaced the database. Nothing on screen is real any more.
  dataReplaced: boolean
}

export function useTabPresence(): TabPresenceState {
  const [state, setState] = useState<TabPresenceState>(() => ({
    tabId: crypto.randomUUID(),
    peerCount: 0,
    // Optimistic until the join grace elapses — see JOIN_GRACE_MS. Starting
    // false would stall the first backup of a single-tab session for no reason.
    isLeader: true,
    dataReplaced: false,
  }))

  useEffect(() => {
    const id = state.tabId
    const presence = createTabPresence({ id, startedAt: Date.now() })
    const bus = getChannel()

    function sync(replaced = false) {
      const now = Date.now()
      setState((previous) => ({
        tabId: id,
        peerCount: presence.peerIds(now).length,
        isLeader: presence.isLeader(now),
        // Latching. Once the data underneath has been replaced this tab is
        // stale for good; there is no recovering from it short of a reload, and
        // flickering the warning off would be worse than not showing it.
        dataReplaced: previous.dataReplaced || replaced,
      }))
    }

    function onMessage(event: MessageEvent) {
      const result = presence.receive(event.data, Date.now())
      // Answer a newcomer at once so both tabs know about each other within a
      // round trip rather than a heartbeat.
      if (result.isNewPeer) post({ kind: "ping", id })
      sync(result.replaced)
    }

    bus?.addEventListener("message", onMessage)

    post({ kind: "ping", id })
    // Also re-evaluates leadership, which is how a tab notices that the peer
    // holding it has gone silent.
    const beat = setInterval(() => {
      post({ kind: "ping", id })
      sync()
    }, HEARTBEAT_MS)

    // Nothing depends on this arriving — peers expire on their own — but it
    // hands leadership over immediately instead of after a timeout.
    const farewell = () => post({ kind: "bye", id })
    window.addEventListener("pagehide", farewell)

    // isLeader is held false through the join grace, so the first honest answer
    // is only available once it has elapsed.
    const settle = setTimeout(() => sync(), JOIN_GRACE_MS)

    return () => {
      farewell()
      bus?.removeEventListener("message", onMessage)
      clearInterval(beat)
      clearTimeout(settle)
      window.removeEventListener("pagehide", farewell)
    }
    // Deliberately empty: state.tabId is generated once in the initialiser and
    // never changes, and re-running this would have the tab rejoin under a new
    // identity — leaving its old one to time out as a phantom peer.
  }, [])

  return state
}
