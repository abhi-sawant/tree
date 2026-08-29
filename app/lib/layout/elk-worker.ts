/// <reference lib="webworker" />
import ElkConstructor from "elkjs/lib/elk-api.js"
import type { ElkNode } from "elkjs"
// A Vite "?url" import: a static asset URL string, not a module — this file
// is elkjs's actual GWT-compiled layout algorithm, meant to run as a real
// worker's entry script. elkjs's *default* entry ("elkjs", used by
// compute-layout.ts for tests) instead tries to `require()` this same file
// in-process as a synchronous fallback — but that file's own environment
// check (`typeof document === "undefined" && typeof self !== "undefined"`)
// can't tell "required from inside another Worker" apart from "loaded
// directly as a Worker's own entry script", and always picks the latter,
// hijacking whichever `self.onmessage` happens to be registered instead of
// exporting anything. Constructing ELK with an explicit `workerUrl` here
// sidesteps that entirely: elkjs spawns *this* file as a genuine nested
// Worker, which is exactly the scenario its self-detection expects.
import elkWorkerUrl from "elkjs/lib/elk-worker.min.js?url"

import { runLayout, type NodePosition } from "~/lib/layout/run-layout"
import { filterOverridden } from "~/lib/layout/filter-overridden"

export interface ElkWorkerRequest {
  graph: ElkNode
  overriddenNodeIds: string[]
}

export interface ElkWorkerResponse {
  positions: Record<string, NodePosition>
}

const elk = new ElkConstructor({ workerUrl: elkWorkerUrl })

self.onmessage = async (event: MessageEvent<ElkWorkerRequest>) => {
  const { graph, overriddenNodeIds } = event.data
  const positions = await runLayout(elk, graph)
  const response: ElkWorkerResponse = {
    positions: filterOverridden(positions, overriddenNodeIds),
  }
  self.postMessage(response)
}
