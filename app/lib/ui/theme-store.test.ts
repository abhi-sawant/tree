import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  THEME_STORAGE_KEY,
  applyTheme,
  resolveTheme,
  useThemeStore,
  watchSystemTheme,
} from "~/lib/ui/theme-store"

function mockPrefersDark(matches: boolean) {
  const listeners = new Set<() => void>()
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    }))
  )
  return listeners
}

beforeEach(() => {
  document.documentElement.classList.remove("dark")
  useThemeStore.setState({ theme: "system" })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("resolveTheme", () => {
  it("passes an explicit choice straight through", () => {
    mockPrefersDark(true)
    expect(resolveTheme("light")).toBe("light")
    expect(resolveTheme("dark")).toBe("dark")
  })

  it("follows the system for system", () => {
    mockPrefersDark(true)
    expect(resolveTheme("system")).toBe("dark")
    mockPrefersDark(false)
    expect(resolveTheme("system")).toBe("light")
  })
})

describe("applyTheme", () => {
  it("adds the dark class app.css already keys off", () => {
    mockPrefersDark(false)
    applyTheme("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("removes it again for light", () => {
    mockPrefersDark(false)
    applyTheme("dark")
    applyTheme("light")
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })

  it("follows the system preference when set to system", () => {
    mockPrefersDark(true)
    applyTheme("system")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("updates the theme-color meta so browser chrome follows", () => {
    mockPrefersDark(false)
    const meta = document.createElement("meta")
    meta.setAttribute("name", "theme-color")
    meta.setAttribute("content", "#original")
    document.head.appendChild(meta)

    applyTheme("dark")

    // jsdom resolves no stylesheet variables, so the tag is left alone rather
    // than being overwritten with an empty value — which is the guard that
    // matters: a blank theme-color would be worse than a stale one.
    expect(meta.getAttribute("content")).toBe("#original")
    meta.remove()
  })
})

describe("setTheme", () => {
  it("applies immediately as well as storing", () => {
    mockPrefersDark(false)
    useThemeStore.getState().setTheme("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(useThemeStore.getState().theme).toBe("dark")
  })
})

describe("watchSystemTheme", () => {
  it("re-applies when the system flips and the preference is system", () => {
    const listeners = mockPrefersDark(false)
    const stop = watchSystemTheme()

    mockPrefersDark(true)
    for (const listener of listeners) listener()

    expect(document.documentElement.classList.contains("dark")).toBe(true)
    stop()
  })

  it("ignores a system flip when an explicit theme is chosen", () => {
    const listeners = mockPrefersDark(false)
    useThemeStore.setState({ theme: "light" })
    const stop = watchSystemTheme()

    mockPrefersDark(true)
    for (const listener of listeners) listener()

    expect(document.documentElement.classList.contains("dark")).toBe(false)
    stop()
  })

  it("returns a no-op when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined)
    expect(() => watchSystemTheme()()).not.toThrow()
  })
})

describe("THEME_STORAGE_KEY", () => {
  it("is the key the pre-paint script in index.html actually reads", () => {
    // Asserting against index.html rather than a copy of the literal: if the two
    // drift, every saved preference is silently orphaned and the
    // white-flash-on-load this script exists to prevent comes back. Nothing
    // else would catch it, since both halves keep working on their own.
    const html = readFileSync(join(process.cwd(), "index.html"), "utf8")
    expect(html).toContain(`localStorage.getItem("${THEME_STORAGE_KEY}")`)
  })

  it("is read by index.html with the shape zustand/persist writes", () => {
    const html = readFileSync(join(process.cwd(), "index.html"), "utf8")
    // persist wraps the value as { state: { theme } }, so the script has to
    // reach through both levels.
    expect(html).toContain("JSON.parse(saved).state.theme")
  })
})
