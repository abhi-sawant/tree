import Dexie, { type DBCore, type DBCoreMutateRequest } from "dexie"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  BOOKKEEPING_TABLES,
  clearDataChangeListeners,
  dataChangeMiddleware,
  notifyDataChange,
  onDataChange,
} from "~/lib/db/change-signal"

afterEach(() => {
  clearDataChangeListeners()
})

describe("onDataChange / notifyDataChange", () => {
  it("delivers to every listener", () => {
    const a = vi.fn()
    const b = vi.fn()
    onDataChange(a)
    onDataChange(b)

    notifyDataChange(["people"])

    expect(a).toHaveBeenCalledWith(["people"])
    expect(b).toHaveBeenCalledWith(["people"])
  })

  it("stops delivering after unsubscribe", () => {
    const listener = vi.fn()
    const off = onDataChange(listener)
    off()

    notifyDataChange(["people"])

    expect(listener).not.toHaveBeenCalled()
  })

  it("ignores an empty table list", () => {
    const listener = vi.fn()
    onDataChange(listener)

    notifyDataChange([])

    expect(listener).not.toHaveBeenCalled()
  })

  it("keeps going when one listener throws", () => {
    const survivor = vi.fn()
    onDataChange(() => {
      throw new Error("bad listener")
    })
    onDataChange(survivor)

    expect(() => notifyDataChange(["people"])).not.toThrow()
    expect(survivor).toHaveBeenCalledOnce()
  })

  it("tolerates a listener unsubscribing itself mid-notification", () => {
    const later = vi.fn()
    const off = onDataChange(() => off())
    onDataChange(later)

    expect(() => notifyDataChange(["people"])).not.toThrow()
    expect(later).toHaveBeenCalledOnce()
  })
})

describe("dataChangeMiddleware", () => {
  // A stand-in DBCore: the middleware only ever calls down.table(name).mutate,
  // so this is everything it needs to be exercised without a real database.
  function fakeCore(): { core: DBCore; mutations: string[] } {
    const mutations: string[] = []
    const table = (name: string) =>
      ({
        name,
        mutate: (request: DBCoreMutateRequest) => {
          mutations.push(`${name}:${request.type}`)
          return Promise.resolve({
            numFailures: 0,
            failures: {},
            results: [],
            lastResult: undefined,
          })
        },
      }) as unknown as ReturnType<DBCore["table"]>
    return { core: { table } as unknown as DBCore, mutations }
  }

  function put(): DBCoreMutateRequest {
    return {
      type: "put",
      values: [{ id: "1" }],
    } as unknown as DBCoreMutateRequest
  }

  // Dexie types `create` as optional and its result as Partial<DBCore>. This
  // middleware always defines it and always returns a whole core, so narrowing
  // once here keeps every call below readable.
  function wrap(core: DBCore, ignored?: readonly string[]): DBCore {
    const middleware = dataChangeMiddleware(ignored)
    return middleware.create!(core) as DBCore
  }

  it("signals the table a write landed in", async () => {
    const listener = vi.fn()
    onDataChange(listener)
    const { core } = fakeCore()

    await wrap(core).table("people").mutate(put())

    expect(listener).toHaveBeenCalledWith(["people"])
  })

  it("stays quiet for bookkeeping tables", async () => {
    const listener = vi.fn()
    onDataChange(listener)
    const { core } = fakeCore()
    const wrapped = wrap(core)

    for (const table of BOOKKEEPING_TABLES) {
      await wrapped.table(table).mutate(put())
    }

    expect(listener).not.toHaveBeenCalled()
  })

  it("still performs the underlying write", async () => {
    const { core, mutations } = fakeCore()
    const wrapped = wrap(core)

    await wrapped.table("people").mutate(put())
    await wrapped.table("appMeta").mutate(put())

    expect(mutations).toEqual(["people:put", "appMeta:put"])
  })

  it("signals once per operation, so a bulk write fires per call", async () => {
    const listener = vi.fn()
    onDataChange(listener)
    const wrapped = wrap(fakeCore().core)

    await wrapped.table("people").mutate(put())
    await wrapped.table("people").mutate(put())

    expect(listener).toHaveBeenCalledTimes(2)
  })

  it("honours a custom ignore list", async () => {
    const listener = vi.fn()
    onDataChange(listener)
    const wrapped = wrap(fakeCore().core, ["people"])

    await wrapped.table("people").mutate(put())
    await wrapped.table("appMeta").mutate(put())

    expect(listener).toHaveBeenCalledExactlyOnceWith(["appMeta"])
  })

  it("catches writes that bypass the lib/db helpers entirely", async () => {
    const seen: string[][] = []
    onDataChange((tables) => seen.push([...tables]))

    const probe = new Dexie("ChangeSignalProbeDB")
    probe.version(1).stores({ people: "id", appMeta: "key" })
    probe.use(dataChangeMiddleware())
    // Exactly the "never write to db.* from UI code" convention being broken.
    await probe.table("people").put({ id: "1" })
    await probe.table("appMeta").put({ key: "k", value: "v" })
    probe.close()
    await Dexie.delete("ChangeSignalProbeDB")

    expect(seen).toEqual([["people"]])
  })
})
