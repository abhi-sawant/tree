import { create } from "zustand"
import { persist } from "zustand/middleware"

export type ThemePreference = "system" | "light" | "dark"

export const THEME_OPTIONS: Array<{
  value: ThemePreference
  label: string
}> = [
  { value: "system", label: "Match system" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]

// Read by the inline script in index.html as well as by this store, so the two
// must agree. Changing it orphans everybody's saved preference.
export const THEME_STORAGE_KEY = "familytree:theme"

const DARK_QUERY = "(prefers-color-scheme: dark)"

export function prefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false
  return window.matchMedia(DARK_QUERY).matches
}

export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") return prefersDark() ? "dark" : "light"
  return preference
}

// app.css already carried a complete `.dark` palette; nothing ever added the
// class. Applying it is the whole of the switch.
//
// The theme-color meta tag is updated alongside it so the browser's own chrome
// — the address bar, and the status bar of the installed PWA — doesn't stay
// light while the app goes dark.
export function applyTheme(preference: ThemePreference): void {
  if (typeof document === "undefined") return
  const resolved = resolveTheme(preference)
  document.documentElement.classList.toggle("dark", resolved === "dark")

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    const background = getComputedStyle(document.documentElement)
      .getPropertyValue("--background")
      .trim()
    if (background) meta.setAttribute("content", background)
  }
}

interface ThemeState {
  theme: ThemePreference
  setTheme: (theme: ThemePreference) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "system",
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
    }),
    {
      name: THEME_STORAGE_KEY,
      // Storage is read before React mounts by the inline script, and again here
      // on rehydration — applying on rehydrate keeps the two in step even if the
      // inline script was blocked or the value changed in another tab.
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme)
      },
    }
  )
)

// Follows the OS while the preference is "system". Registered once from the app
// root rather than per component, since it mutates a document-level class.
export function watchSystemTheme(): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {}
  const query = window.matchMedia(DARK_QUERY)
  const onChange = () => {
    if (useThemeStore.getState().theme === "system") applyTheme("system")
  }
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}
