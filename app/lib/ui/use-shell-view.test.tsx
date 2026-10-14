// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { MemoryRouter, useLocation } from "react-router"
import { describe, expect, it } from "vitest"

import {
  useGoBack,
  usePreviousView,
  useSetView,
  useView,
} from "~/lib/ui/use-shell-view"

function setup(initial: string) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: [initial] }, children)
  return renderHook(
    () => ({
      view: useView(),
      previous: usePreviousView(),
      setView: useSetView(),
      goBack: useGoBack(),
      path: useLocation().pathname,
    }),
    { wrapper }
  )
}

describe("URL-backed view", () => {
  it("reads the view from the path", () => {
    expect(setup("/people").result.current.view).toBe("table")
  })

  it("navigates by writing the path", () => {
    const { result } = setup("/tree")
    act(() => result.current.setView("settings"))
    expect(result.current.path).toBe("/settings")
    expect(result.current.view).toBe("settings")
  })

  it("goes back to the bottom-bar view a sub-screen was opened from", () => {
    const { result } = setup("/photos")
    act(() => result.current.setView("insights"))
    expect(result.current.previous).toBe("photos")
    act(() => result.current.goBack())
    expect(result.current.path).toBe("/photos")
  })

  it("sends a sub-screen opened by link back to More", () => {
    const { result } = setup("/health")
    act(() => result.current.goBack())
    expect(result.current.path).toBe("/more")
  })
})
