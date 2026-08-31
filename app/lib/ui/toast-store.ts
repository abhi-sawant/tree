import { create } from "zustand"

// Toasts are transient one-liners confirming an action ("Layout recomputed",
// "Backup exported"). Only ever one at a time — a second toast replaces the
// first rather than stacking, matching the single bottom-centre slot the
// design gives them.
const TOAST_DURATION_MS = 2200

interface ToastState {
  message: string | null
  showToast: (message: string) => void
  dismissToast: () => void
}

let timer: ReturnType<typeof setTimeout> | undefined

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  showToast: (message) => {
    clearTimeout(timer)
    set({ message })
    timer = setTimeout(() => set({ message: null }), TOAST_DURATION_MS)
  },
  dismissToast: () => {
    clearTimeout(timer)
    set({ message: null })
  },
}))

// Callable from event handlers and async flows that aren't React components.
export const toast = (message: string) =>
  useToastStore.getState().showToast(message)
