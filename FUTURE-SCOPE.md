# Family Tree Generator — Future Scope

**Status:** v1 complete (all of the former `PLAN.md`'s steps 1–14 shipped — see git history, PRs #2–#14).
This document replaces `PLAN.md` and expands [SPEC.md §8](./SPEC.md#8-explicitly-out-of-scope-for-v1)'s
out-of-scope list into concrete, buildable proposals for a v2+.

Nothing here is scheduled. Each section is written so that whoever picks it up next doesn't have to
re-derive the design from scratch — but every decision below is open to revisiting.

---

## 1. Cloud sync / multi-device

**Problem:** v1 is single-device, IndexedDB-only (Dexie). Data never leaves the browser it was created in.

**Proposal:**
- Introduce a sync-friendly change log: every Dexie write also appends a `{table, op, id, payload, ts}` row to a local `SyncLog` table.
- Backend: a minimal sync server (e.g. a small Postgres-backed API, or a hosted sync service like Supabase/PowerSync/ElectricSQL) that accepts batches of log entries and returns entries since a client's last-seen cursor.
- Conflict resolution: last-write-wins per field is simplest and matches the low-concurrency, single-user-per-tree usage pattern; per-record vector clocks are overkill unless multi-user editing (see §2) lands first.
- Photos (`Blob`s) need object storage (S3-compatible) rather than inlining into the sync log; `Photo` rows would carry a URL instead of a raw blob once synced.
- This is the single biggest architectural change in this list — it turns a static SPA into a client-server app and reopens D1 (SPA-only, static hosting). Should not be undertaken casually.

**Depends on:** nothing else here; blocks §2 (accounts) since sync needs a place to attribute data to a user.

---

## 2. User accounts

**Problem:** v1 has no concept of a user — one browser profile is one person's entire dataset.

**Proposal:**
- Only meaningful once §1 (cloud sync) exists — accounts without sync just gate a local app behind a login for no benefit.
- Auth via a standard provider (email magic link or OAuth) rather than rolling custom password storage.
- Data model: add a `Workspace` (or reuse `Tree` ownership) scoped to a user; decide whether trees are private-by-default or shareable — sharing implies real-time multi-user editing concerns (presence, locking) that are out of scope for a first pass.
- Minimal viable version: single-user-per-account cloud backup (no sharing) — i.e. accounts exist purely to key the sync log in §1, not to enable collaboration.

**Depends on:** §1.

---

## 3. GEDCOM import

**Problem:** v1 only exports GEDCOM (Step 11); there's no way to bring in an existing family tree from another tool (Ancestry, FamilySearch, Gramps, etc.).

**Proposal:**
- Hand-roll a parser (mirroring the hand-rolled writer from Step 11) rather than pulling in a heavy GEDCOM library — the format is small enough (`INDI`, `FAM`, `NAME`, `BIRT`/`DEAT` + `DATE`, `NOTE`, `FAMC`/`FAMS` pointers) that a ~200-300 line recursive-descent parser covering GEDCOM 5.5.1 is tractable.
- Reverse of Step 11's mapping: `INDI` → `Person`, `FAM` → a `spouse` relationship (if `HUSB`+`WIFE` present) plus `parent-child` relationships to each `CHIL`.
- Needs explicit merge/dedup UX (see §9 below) since import must coexist with existing pool data — unlike JSON import (D13), GEDCOM import should almost certainly be additive/mergeable, not replace-only, since the whole point is combining trees from different sources.
- Validation/error surface: malformed GEDCOM, unsupported tags (skip with a warning list, don't hard-fail), date-format edge cases feeding back into `partialDateFromGedcomDate` (inverse of the existing `partialDateToGedcomDate`).
- Placeholder generation: a `FAMC` pointing to an `INDI` not present in the file should create a placeholder `Person` (mirrors D5/D6) rather than failing.

**Depends on:** §9 (import merge/dedup) for a good experience, but can ship a naive "always create new people" version without it.

---

## 4. Sources, citations, life events, places

**Problem:** v1's `Person` model only has birth/death dates and free-text notes — no structured events, no way to cite where a fact came from, no place data.

**Proposal (data model):**
```ts
interface LifeEvent {
  id: string;
  personId: string;
  type: 'birth' | 'death' | 'marriage' | 'residence' | 'occupation' | 'education' | 'custom';
  label?: string;       // for 'custom'
  date?: PartialDate;
  place?: Place;
  sourceIds?: string[];
  notes?: string;
}

interface Place {
  id: string;
  name: string;          // free text: "Springfield, Illinois, USA"
  lat?: number;
  lng?: number;
}

interface Source {
  id: string;
  title: string;
  citation?: string;     // free-text citation text
  url?: string;
  photoId?: string;      // scanned document/certificate
}
```
- Birth/death on `Person` become sugar over an implicit `LifeEvent` (or stay as-is for backward compat and let `LifeEvent` be strictly additive/optional — avoids a breaking schema migration).
- UI: an "Events" tab in the detail panel (D2), a `<SourcePicker>` similar to `<PersonPicker>` (D10), inline citation badges next to any sourced fact.
- Places could later support a map view, but that's a separate, larger feature — don't couple it to this one.
- This is the largest single expansion of the data model in this list; should be scoped as its own multi-step plan (à la the original PLAN.md) rather than one PR.

---

## 5. Relationship path finder ("how is X related to Y?")

**Problem:** No way to answer "how are these two people connected" beyond manually tracing the canvas.

**Proposal:**
- Pure graph algorithm, no schema changes: BFS from both `X` and `Y` over the undirected relationship graph (parent-child edges traversed in both directions, plus spouse edges), meeting in the middle to find the shortest connecting path.
- Present the path as a plain-language description (e.g. "X is Y's spouse's brother's daughter") — this description-generation step is the actually-hard part, not the BFS. Needs a small rules engine mapping path shapes (sequences of up/down/lateral edges) to relationship terms (cousin, great-aunt, etc.), including "N times removed" logic for cross-generation cousins.
- Reasonable to scope the language generator to direct lineage + siblings + first-order cousins for v1 of this feature, with a fallback "connected via: A → B → C" raw-path display for anything more exotic, rather than trying to name every possible kinship term up front.
- UI: a two-person picker (reuse `<PersonPicker>`) accessible from `/people` or a canvas toolbar action; highlight the path nodes/edges on the canvas when invoked from there.

---

## 6. Timeline view

**Problem:** The only view of the data is the tree canvas; there's no chronological view of events across the family.

**Proposal:**
- Depends on §4 (life events) for anything richer than birth/death — a timeline of just birth/death dates is a much smaller, shippable-sooner version.
- Rendering: a horizontal axis scaled by year, one row per person (or per family/branch), event markers (birth, death, marriage) plotted along each row. `d3-scale` (or hand-rolled linear scale, matching the project's lean-dependency posture) for the axis; plain SVG/DOM for markers rather than pulling in a full timeline library.
- Scope question to resolve before building: timeline of one tree's members, or the whole pool? Given D14 (GEDCOM export is always whole-pool) and the tree-scoping used everywhere else, default to "scoped to the currently open tree" for consistency, with a possible "whole pool" toggle later.
- Interaction: clicking an event jumps to that person on the canvas (selects the node, pans to it).

---

## 7. Multi-page PDF tiling

**Problem:** Step 10's PDF export scales the whole tree to fit one page — large trees become illegibly small.

**Proposal:**
- Extend `app/lib/export/pdf.ts`: instead of one `fitView` capture, compute a grid of viewport rects covering the full graph bounds at a fixed, legible scale (e.g. 100%), capture each tile via `html-to-image`, and place each as its own PDF page via `jsPDF.addPage()`.
- Needs overlap margins between tiles (so a node split across a page boundary is still fully legible on at least one page) and simple crop-mark or page-number annotations so physical pages can be reassembled.
- Tile order/orientation: row-major left-to-right, top-to-bottom, matching how someone would tape pages together on a table.
- Should reuse the same `fitView`-then-capture mechanism from Step 10, just parameterized by tile rect instead of the whole-graph rect.

---

## 8. Radial / alternative layouts

**Problem:** v1 ships exactly one layout: ELK's `layered` algorithm, top-down generational rows (Step 4).

**Proposal:**
- ELK itself supports alternative algorithms (`radial`, `mrtree`, `force`) — swapping the algorithm string in the Step 4 worker (`app/lib/layout/elk-worker.ts`) is the cheap first step, but each produces a different node/edge shape that the existing `PersonNode`/`UnionNode` renderers and position-override model (Step 6, D9) need to keep working with.
- Radial (ancestor-fan / pedigree-chart style, focused on one person's direct ancestors) is the most commonly requested alternative in genealogy tools and is meaningfully different from the current descendant-oriented layered graph — likely wants its own adapter (parallel to `to-elk-graph.ts`) rather than reusing the union-derivation graph as-is, since a pedigree fan typically shows only direct ancestors (no siblings/unions) of a single focus person.
- UI: a layout picker in the tree toolbar; persisting the chosen layout per-tree (extend the `Tree` model) or per-session.
- Position overrides (D9) are layout-specific — switching layouts should either warn that it clears overrides, or overrides should be namespaced per-layout-mode.

---

## 9. JSON-import merge/dedup (superseding D13)

**Problem:** D13 made JSON import replace-only for v1 ("wipes local DB, restores from envelope. No merge/dedup."). That's fine for backup/restore but blocks combining two independently-built trees.

**Proposal:**
- Identity resolution is the core problem: given two `Person` records from different pools, are they the same person? No stable external ID exists (v1 `Person.id` is locally generated), so matching has to be heuristic: name (fuzzy/normalized) + birth year (exact or ±1) + shared parent/spouse links as corroborating signal.
- UX: after parsing the incoming envelope, show a review screen listing likely-duplicate pairs (score-ranked) with "merge" / "keep both" per pair, plus a bulk "import everyone else as new" action. Never auto-merge silently — a wrong merge silently corrupts two people's data into one.
- Merge semantics: when two `Person` records are merged, their relationships need re-pointing (`from`/`to` id swap) and `TreeMember` rows need de-duplication per tree (can't have the same person twice in one tree).
- This is also the mechanism §3 (GEDCOM import) should reuse for its own merge story, so building it against the existing JSON envelope format first (smaller surface, already-validated schema) is the more tractable starting point.

---

## 10. Mobile-specific interaction design (superseding D15)

**Problem:** D15 shipped "desktop-first... touch works via React Flow's built-in support; no dedicated mobile interaction design."

**Proposal:**
- Audit React Flow's default touch behavior against the app's actual interactions: pan/zoom/select work out of the box, but the detail panel (D2, a fixed side panel) and context menus (add-relative menu, Step 5) were built assuming pointer + hover affordances (tooltips for disabled states, right-click-style context menus) that don't translate directly to touch.
- Concrete gaps likely worth addressing first: the detail side panel should become a bottom sheet or full-screen overlay below some viewport width; disabled-state tooltips (e.g. "blocked past 2 parents") need a tap-triggered equivalent since there's no hover; drag-to-reposition (Step 6) needs a "move mode" toggle on touch since a plain drag is indistinguishable from a pan/select gesture on small targets.
- Responsive layout breakpoints for `/people` (table view) — likely needs a card-list view below tablet width.
- Should start with a UX audit/walkthrough on an actual touch device (or simulator) against every flow in SPEC §3, cataloguing specific breakages, before writing any code — this is a design pass first, implementation second.

---

## 11. Undo/redo (superseding D16)

**Problem:** D16: "No undo/redo in v1." Every mutation (person edits, relationship changes, deletes, layout resets) is immediate and permanent (modulo the D3/D4 delete-confirmation dialog).

**Proposal:**
- Command-pattern history: every mutating operation in `app/lib/db/*` already goes through a small set of functions (`createPerson`, `updatePerson`, `deletePerson`, `addRelationship`, `removeRelationship`, tree/member mutations) — wrap each with a paired inverse operation and push `{do, undo}` onto an in-memory stack as they're called, rather than snapshotting the whole DB per action.
- Scope: session-only undo stack (cleared on reload) is a reasonable v1-of-this-feature — durable/persisted undo history across sessions is a much bigger lift (needs its own storage, GC policy) and isn't obviously worth it for a tool where destructive actions already require confirmation (D3/D4).
- Cascading deletes (D3) are the hard case: undoing a person-delete means restoring the person, all their relationships, all their `TreeMember` rows, and their `Photo` blob — the inverse operation needs to capture that full snapshot at delete time, not just the person row.
- UI: standard toolbar undo/redo buttons + `Cmd/Ctrl+Z` / `Shift+Cmd/Ctrl+Z`, scoped globally (not per-tree) since some mutations (person edits from `/people`) aren't tree-scoped at all.
- Re-layout interaction: an undo that removes/re-adds a node should re-trigger the D9 auto-layout recompute, same as the original mutation did.

---

## Suggested sequencing

These aren't independent in value — a rough dependency-aware order, if tackled as a v2:

1. **Undo/redo (§11)** and **mobile interaction design (§10)** — pure UX/robustness improvements to the existing v1 feature set, no data model changes, no new dependencies. Lowest risk, immediate user-facing value.
2. **JSON-import merge/dedup (§9)** — unblocks combining trees, which is a real gap today (only replace-import exists).
3. **GEDCOM import (§3)** — reuses §9's merge machinery; the natural "bring your data in" counterpart to the existing GEDCOM export.
4. **Relationship path finder (§5)** and **multi-page PDF tiling (§7)** — self-contained, additive features, no architecture changes.
5. **Sources/citations/events/places (§4)** — the big data-model expansion; worth its own planning pass once the above has settled.
6. **Timeline view (§6)** — cheap in a birth/death-only form now, richer once §4 lands.
7. **Radial/alternative layouts (§8)** — independent, but lower priority than the above unless specifically requested.
8. **Cloud sync (§1)** and **accounts (§2)** — the biggest architectural shift (reopens D1's static-SPA-only decision); should only be undertaken as a deliberate "v2 platform" decision, not folded in incrementally alongside the smaller items above.
