import type { ElkNode } from "elkjs"
import { useEffect, useState } from "react"

import type {
  ElkWorkerRequest,
  ElkWorkerResponse,
} from "~/lib/layout/elk-worker"
import type { NodePosition } from "~/lib/layout/run-layout"

export type LayoutStatus = "idle" | "computing" | "done" | "error"

export interface LayoutState {
  status: LayoutStatus
  positions?: Record<string, NodePosition>
}

export function useElkLayout(
  graph: ElkNode | undefined,
  overriddenNodeIds: string[],
  layoutOptions?: Record<string, string>
): LayoutState {
  const [state, setState] = useState<LayoutState>({ status: "idle" })

  useEffect(() => {
    if (!graph) return

    setState((s) => ({ status: "computing", positions: s.positions }))
    const worker = new Worker(new URL("./elk-worker.ts", import.meta.url), {
      type: "module",
    })
    let cancelled = false

    worker.onmessage = (event: MessageEvent<ElkWorkerResponse>) => {
      if (cancelled) return
      setState({ status: "done", positions: event.data.positions })
    }
    worker.onerror = () => {
      if (cancelled) return
      setState((s) => ({ ...s, status: "error" }))
    }
    worker.postMessage({
      graph,
      overriddenNodeIds,
      layoutOptions,
    } satisfies ElkWorkerRequest)

    return () => {
      cancelled = true
      worker.terminate()
    }
  }, [graph, overriddenNodeIds, layoutOptions])

  return state
}
