/// <reference lib="webworker" />
import ElkConstructor from "elkjs/lib/elk-api.js"
import type { ElkNode } from "elkjs"

import { runLayout, type NodePosition } from "~/lib/layout/run-layout"
import { filterOverridden } from "~/lib/layout/filter-overridden"

export interface ElkWorkerRequest {
  graph: ElkNode
  overriddenNodeIds: string[]
  layoutOptions?: Record<string, string>
}

export interface ElkWorkerResponse {
  positions: Record<string, NodePosition>
}

// elk-worker.min.js is elkjs's actual GWT-compiled layout algorithm, meant to
// run as a real worker's entry script. elkjs's *default* entry ("elkjs",
// used by compute-layout.ts for tests) instead tries to `require()` this
// same file in-process as a synchronous fallback — but that file's own
// environment check (`typeof document === "undefined" && typeof self !==
// "undefined"`) can't tell "required from inside another Worker" apart from
// "loaded directly as a Worker's own entry script", and always picks the
// latter, hijacking whichever `self.onmessage` happens to be registered
// instead of exporting anything. Constructing ELK with an explicit
// `workerUrl` here sidesteps that entirely: elkjs spawns *this* file as a
// genuine nested Worker, which is exactly the scenario its self-detection
// expects.
//
// The URL is served by the elk-worker-asset Vite plugin (vite.config.ts) as
// a raw static asset rather than imported with `?url` — see that plugin for
// why: Vite's normal JS transform pipeline mangles this file badly enough
// that the nested Worker can never load it.
const elkWorkerUrl = `${import.meta.env.BASE_URL}elk-worker.min.js`
const elk = new ElkConstructor({ workerUrl: elkWorkerUrl })

self.onmessage = async (event: MessageEvent<ElkWorkerRequest>) => {
  const { graph, overriddenNodeIds, layoutOptions } = event.data
  const positions = await runLayout(elk, graph, layoutOptions)
  const response: ElkWorkerResponse = {
    positions: filterOverridden(positions, overriddenNodeIds),
  }
  self.postMessage(response)
}
