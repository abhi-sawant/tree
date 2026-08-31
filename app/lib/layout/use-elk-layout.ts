import ElkConstructor from "elkjs/lib/elk-api.js"
import type { ELK, ElkNode } from "elkjs"
import { useEffect, useState } from "react"

import { filterOverridden } from "~/lib/layout/filter-overridden"
import { runLayout, type NodePosition } from "~/lib/layout/run-layout"

export type LayoutStatus = "idle" | "computing" | "done" | "error"

export interface LayoutState {
  status: LayoutStatus
  positions?: Record<string, NodePosition>
}

// elk-worker.min.js is elkjs's GWT-compiled layout algorithm, built to run as a
// classic Worker's own entry script. Constructing ELK with an explicit
// `workerUrl` makes elkjs spawn it as exactly that, and keeps us off elkjs's
// default entry point, whose synchronous in-process fallback `require()`s the
// same file and hijacks whatever `self.onmessage` is registered instead of
// exporting anything. (compute-layout.ts does use the default entry — correctly,
// since in Node that fallback is the only option and the hijack can't happen.)
//
// This runs on the main thread on purpose. An earlier design wrapped it in a
// second Worker so that ELK was constructed inside a worker, which made elkjs
// spawn elk-worker.min.js as a *nested* worker — and that nested script fetch
// aborts, so layout never resolved and the canvas hung on "Laying out tree…"
// forever. Nothing is lost by dropping the wrapper: the expensive part is
// elk.layout(), which still runs in elkjs's own worker. All that moved onto the
// main thread is runLayout's positions loop and filterOverridden's filter, both
// O(nodes) over a few hundred entries.
//
// The URL is served by the elk-worker-asset Vite plugin (vite.config.ts) as a
// raw static asset rather than imported with `?url` — see that plugin for why:
// Vite's JS transform pipeline mangles this file badly enough that the worker
// can never load it.
let elk: ELK | undefined

function getElk(): ELK {
  elk ??= new ElkConstructor({
    workerUrl: `${import.meta.env.BASE_URL}elk-worker.min.js`,
  })
  return elk
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

    // elk.layout() has no cancellation, so a superseded run is dropped on
    // arrival instead. Concurrent runs are safe: elkjs matches worker replies
    // to requests by id, so an in-flight layout is never confused with a newer
    // one — the flag only decides whose result reaches state.
    let cancelled = false

    runLayout(getElk(), graph, layoutOptions)
      .then((positions) => {
        if (cancelled) return
        setState({
          status: "done",
          positions: filterOverridden(positions, overriddenNodeIds),
        })
      })
      .catch(() => {
        if (cancelled) return
        setState((s) => ({ ...s, status: "error" }))
      })

    return () => {
      cancelled = true
    }
  }, [graph, overriddenNodeIds, layoutOptions])

  return state
}
