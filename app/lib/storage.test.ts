import { afterEach, describe, expect, it, vi } from "vitest"

import {
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
