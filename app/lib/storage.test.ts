import { afterEach, describe, expect, it, vi } from "vitest"

import {
  estimateStorage,
  isStorageApiSupported,
  isStoragePersisted,
  requestPersistentStorage,
} from "~/lib/storage"

const originalStorage = navigator.storage

afterEach(() => {
  Object.defineProperty(navigator, "storage", {
    value: originalStorage,
    configurable: true,
  })
})

function mockStorage(overrides: Partial<StorageManager>) {
  Object.defineProperty(navigator, "storage", {
    value: overrides,
    configurable: true,
  })
}

describe("storage", () => {
  it("reports unsupported when navigator.storage is unavailable", async () => {
    Object.defineProperty(navigator, "storage", {
      value: undefined,
      configurable: true,
    })
    expect(isStorageApiSupported()).toBe(false)
    expect(await isStoragePersisted()).toBe(false)
    expect(await requestPersistentStorage()).toBe(false)
    expect(await estimateStorage()).toBeUndefined()
  })

  it("reports supported when persist is available", () => {
    mockStorage({ persist: vi.fn() })
    expect(isStorageApiSupported()).toBe(true)
  })

  it("skips calling persist() when already persisted", async () => {
    const persist = vi.fn()
    mockStorage({ persisted: vi.fn().mockResolvedValue(true), persist })
    expect(await requestPersistentStorage()).toBe(true)
    expect(persist).not.toHaveBeenCalled()
  })

  it("calls persist() and returns its result when not yet persisted", async () => {
    const persist = vi.fn().mockResolvedValue(true)
    mockStorage({ persisted: vi.fn().mockResolvedValue(false), persist })
    expect(await requestPersistentStorage()).toBe(true)
    expect(persist).toHaveBeenCalledOnce()
  })

  it("swallows a persisted() error", async () => {
    mockStorage({ persisted: vi.fn().mockRejectedValue(new Error("boom")) })
    expect(await isStoragePersisted()).toBe(false)
  })

  it("swallows a persisted() error and still attempts persist()", async () => {
    mockStorage({
      persisted: vi.fn().mockRejectedValue(new Error("boom")),
      persist: vi.fn().mockResolvedValue(true),
    })
    expect(await requestPersistentStorage()).toBe(true)
  })

  it("swallows a persist() error and returns false", async () => {
    mockStorage({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockRejectedValue(new Error("boom")),
    })
    expect(await requestPersistentStorage()).toBe(false)
  })
})

describe("estimateStorage", () => {
  it("passes the browser's own numbers through", async () => {
    mockStorage({
      estimate: vi.fn().mockResolvedValue({ usage: 1234, quota: 100_000 }),
    })
    expect(await estimateStorage()).toEqual({ usage: 1234, quota: 100_000 })
  })

  it("treats zero usage as a real answer", async () => {
    mockStorage({
      estimate: vi.fn().mockResolvedValue({ usage: 0, quota: 500 }),
    })
    expect(await estimateStorage()).toEqual({ usage: 0, quota: 500 })
  })

  it("gives up on a quota it can't divide by", async () => {
    mockStorage({
      estimate: vi.fn().mockResolvedValue({ usage: 10, quota: 0 }),
    })
    expect(await estimateStorage()).toBeUndefined()
  })

  it("gives up when the browser omits the quota", async () => {
    mockStorage({ estimate: vi.fn().mockResolvedValue({ usage: 10 }) })
    expect(await estimateStorage()).toBeUndefined()
  })

  it("defaults a missing usage to zero rather than discarding the quota", async () => {
    mockStorage({ estimate: vi.fn().mockResolvedValue({ quota: 500 }) })
    expect(await estimateStorage()).toEqual({ usage: 0, quota: 500 })
  })

  it("swallows an estimate() error", async () => {
    mockStorage({ estimate: vi.fn().mockRejectedValue(new Error("boom")) })
    expect(await estimateStorage()).toBeUndefined()
  })

  it("reports unavailable when estimate() isn't implemented", async () => {
    mockStorage({ persist: vi.fn() })
    expect(await estimateStorage()).toBeUndefined()
  })
})
