import { describe, expect, it } from "vitest"

import {
  JOIN_GRACE_MS,
  PEER_TIMEOUT_MS,
  createTabPresence,
  isTabMessage,
  type TabMessage,
} from "~/lib/db/tab-presence"

const T0 = 1_000_000
// Past the join grace, so leadership is live unless a test says otherwise.
const SETTLED = T0 + JOIN_GRACE_MS

function presence(id: string, startedAt = T0) {
  return createTabPresence({ id, startedAt })
}

const ping = (id: string): TabMessage => ({ kind: "ping", id })
const bye = (id: string): TabMessage => ({ kind: "bye", id })
const replaced = (id: string): TabMessage => ({ kind: "replaced", id })

describe("isTabMessage", () => {
  it("accepts the three message kinds", () => {
    expect(isTabMessage(ping("a"))).toBe(true)
    expect(isTabMessage(bye("a"))).toBe(true)
    expect(isTabMessage(replaced("a"))).toBe(true)
  })

  it("rejects anything else that might arrive on the channel", () => {
    for (const value of [
      undefined,
      null,
      "ping",
      42,
      {},
      { kind: "ping" },
      { id: "a" },
      { kind: "shutdown", id: "a" },
      { kind: "ping", id: 7 },
    ]) {
      expect(isTabMessage(value)).toBe(false)
    }
  })
})

describe("peer tracking", () => {
  it("starts with no peers", () => {
    expect(presence("a").peerIds(SETTLED)).toEqual([])
  })

  it("records a peer that pings", () => {
    const tab = presence("a")
    tab.receive(ping("b"), SETTLED)

    expect(tab.peerIds(SETTLED)).toEqual(["b"])
  })

  it("flags only the first ping from a peer as new", () => {
    const tab = presence("a")

    expect(tab.receive(ping("b"), SETTLED).isNewPeer).toBe(true)
    expect(tab.receive(ping("b"), SETTLED + 1).isNewPeer).toBe(false)
  })

  it("drops a peer that says goodbye", () => {
    const tab = presence("a")
    tab.receive(ping("b"), SETTLED)
    tab.receive(bye("b"), SETTLED + 1)

    expect(tab.peerIds(SETTLED + 1)).toEqual([])
  })

  it("expires a peer that stopped pinging without saying goodbye", () => {
    const tab = presence("a")
    tab.receive(ping("b"), SETTLED)

    expect(tab.peerIds(SETTLED + PEER_TIMEOUT_MS - 1)).toEqual(["b"])
    expect(tab.peerIds(SETTLED + PEER_TIMEOUT_MS)).toEqual([])
  })

  it("keeps a peer alive while it goes on pinging", () => {
    const tab = presence("a")
    tab.receive(ping("b"), SETTLED)
    tab.receive(ping("b"), SETTLED + PEER_TIMEOUT_MS - 1)

    expect(tab.peerIds(SETTLED + PEER_TIMEOUT_MS)).toEqual(["b"])
  })

  it("keeps a peer whose clock runs ahead of ours", () => {
    const tab = presence("a")
    tab.receive(ping("b"), SETTLED + 60_000)

    expect(tab.peerIds(SETTLED)).toEqual(["b"])
  })

  it("ignores a message from itself", () => {
    const tab = presence("a")
    tab.receive(ping("a"), SETTLED)

    expect(tab.peerIds(SETTLED)).toEqual([])
    expect(tab.isLeader(SETTLED)).toBe(true)
  })

  it("ignores anything that isn't a tab message", () => {
    const tab = presence("a")

    expect(tab.receive({ hello: true }, SETTLED)).toEqual({
      isNewPeer: false,
      replaced: false,
    })
    expect(tab.peerIds(SETTLED)).toEqual([])
  })

  it("lists peers in a stable order", () => {
    const tab = presence("a")
    tab.receive(ping("z"), SETTLED)
    tab.receive(ping("m"), SETTLED)

    expect(tab.peerIds(SETTLED)).toEqual(["m", "z"])
  })

  it("forgets a peer on request", () => {
    const tab = presence("a")
    tab.receive(ping("b"), SETTLED)
    tab.forget("b")

    expect(tab.peerIds(SETTLED)).toEqual([])
  })
})

describe("the replaced signal", () => {
  it("is reported and also counts as presence", () => {
    const tab = presence("a")

    const result = tab.receive(replaced("b"), SETTLED)

    expect(result.replaced).toBe(true)
    expect(tab.peerIds(SETTLED)).toEqual(["b"])
  })

  it("is not reported for an ordinary ping", () => {
    expect(presence("a").receive(ping("b"), SETTLED).replaced).toBe(false)
  })

  it("is ignored when it came from this tab", () => {
    expect(presence("a").receive(replaced("a"), SETTLED).replaced).toBe(false)
  })
})

describe("leader election", () => {
  it("makes a lone tab the leader", () => {
    expect(presence("a").isLeader(SETTLED)).toBe(true)
  })

  it("holds off during the join grace, before it has heard from anyone", () => {
    const tab = presence("a")

    expect(tab.isLeader(T0)).toBe(false)
    expect(tab.isLeader(T0 + JOIN_GRACE_MS - 1)).toBe(false)
    expect(tab.isLeader(T0 + JOIN_GRACE_MS)).toBe(true)
  })

  it("gives leadership to the lowest id", () => {
    const first = presence("a")
    const second = presence("b")
    first.receive(ping("b"), SETTLED)
    second.receive(ping("a"), SETTLED)

    expect(first.isLeader(SETTLED)).toBe(true)
    expect(second.isLeader(SETTLED)).toBe(false)
  })

  it("elects exactly one leader among several tabs", () => {
    const ids = ["c", "a", "d", "b"]
    const tabs = ids.map((id) => presence(id))
    for (const tab of tabs) {
      for (const id of ids) if (id !== tab.id) tab.receive(ping(id), SETTLED)
    }

    expect(
      tabs.filter((tab) => tab.isLeader(SETTLED)).map((t) => t.id)
    ).toEqual(["a"])
  })

  it("promotes the survivor when the leader closes", () => {
    const tab = presence("b")
    tab.receive(ping("a"), SETTLED)
    expect(tab.isLeader(SETTLED)).toBe(false)

    tab.receive(bye("a"), SETTLED + 1)

    expect(tab.isLeader(SETTLED + 1)).toBe(true)
  })

  it("promotes the survivor when the leader vanishes without saying goodbye", () => {
    const tab = presence("b")
    tab.receive(ping("a"), SETTLED)

    expect(tab.isLeader(SETTLED + PEER_TIMEOUT_MS)).toBe(true)
  })

  it("steps back down when the lower-id tab returns", () => {
    const tab = presence("b")
    expect(tab.isLeader(SETTLED)).toBe(true)

    tab.receive(ping("a"), SETTLED + 1)

    expect(tab.isLeader(SETTLED + 1)).toBe(false)
  })
})
