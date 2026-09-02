# Family Tree Generator — Future Scope

**Status:** v1 + the v2 phase programme (Phases 1–7, PRs #15–#22) are both complete. This document
lists what's genuinely still open. See [`ADR.md`](./ADR.md) for the decisions already taken —
several items below explicitly reuse machinery an ADR entry describes.

Nothing here is scheduled. Each section is written so that whoever picks it up next doesn't have to
re-derive the design from scratch — but every decision below is open to revisiting.

---

## 1. Cloud sync / multi-device

**Status:** Not started. Excluded by design, not merely deferred — see `ADR.md` D1/D18 (the offline
constraint). Undertaking this reopens that decision and should be a deliberate "v2 platform" choice,
not folded in alongside anything else on this list.

**Problem:** Data never leaves the browser it was created in.

**Proposal:**
- Introduce a sync-friendly change log: every Dexie write also appends a `{table, op, id, payload, ts}`
  row to a local `SyncLog` table. (Note: Phase 4 already added a Dexie change-signal middleware —
  `app/lib/db/change-signal.ts`, ADR D24 — for a different purpose (local durability triggers), but it
  fires per low-level operation with no payload capture. A sync log is a separate, additive mechanism,
  not a rename of that one.)
- Backend: a minimal sync server (e.g. a small Postgres-backed API, or a hosted sync service like
  Supabase/PowerSync/ElectricSQL) that accepts batches of log entries and returns entries since a
  client's last-seen cursor.
- Conflict resolution: last-write-wins per field is simplest and matches the low-concurrency,
  single-user-per-tree usage pattern.
- Photos and documents (`Blob`s) need object storage (S3-compatible) rather than inlining into the
  sync log.
- This is the single biggest architectural change in this list — it turns a static SPA into a
  client-server app.

**Depends on:** nothing else here; blocks §2 (accounts).

---

## 2. User accounts

**Status:** Not started. Depends on §1.

**Problem:** No concept of a user — one browser profile is one person's entire dataset.

**Proposal:**
- Only meaningful once §1 (cloud sync) exists.
- Auth via a standard provider (email magic link or OAuth) rather than rolling custom password
  storage.
- Minimal viable version: single-user-per-account cloud backup (no sharing) — accounts exist purely
  to key the sync log, not to enable collaboration.

---

## 3. GEDCOM import

**Status:** Not started. Phase 2 (ADR D2x range — see `mergePeople` / `findDuplicates`) built the
merge machinery this can now reuse, which was the blocker noted when this item was first written.

**Problem:** Only export exists (v1 Step 11); there's no way to bring in an existing family tree from
another tool (Ancestry, FamilySearch, Gramps, etc.).

**Proposal:**
- Hand-roll a parser (mirroring the hand-rolled writer) rather than pulling in a heavy GEDCOM
  library — a ~200–300 line recursive-descent parser covering GEDCOM 5.5.1 is tractable.
- Reverse of the export mapping: `INDI` → `Person`, `FAM` → a `spouse` relationship (if
  `HUSB`+`WIFE` present) plus `parent-child` relationships to each `CHIL`.
- Needs the same merge/dedup review UX as §9 below — GEDCOM import should be additive/mergeable, not
  replace-only, since the whole point is combining trees from different sources. It can reuse
  `mergePeople` (`app/lib/db/merge-people.ts`) and `findDuplicates` (`app/lib/analysis/duplicates.ts`)
  directly rather than build parallel matching logic.
- Validation/error surface: malformed GEDCOM, unsupported tags (skip with a warning list, don't
  hard-fail), date-format edge cases (inverse of `partialDateToGedcomDate`).
- A `FAMC` pointing to an `INDI` not present in the file should create a placeholder `Person` (per
  ADR D5/D6) rather than failing.

**Depends on:** §9 for a good experience; can ship a naive "always create new people" version without
it.

---

## 4. Sources, citations, life events, places

**Status:** Not started. Still the largest single expansion of the data model on this list.
`Person.customFields` (Phase 1) remains the deliberate stopgap for anything that doesn't fit the
minimal model yet.

**Problem:** `Person` only has birth/death dates and free-text notes — no structured events, no way
to cite where a fact came from, no place data.

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
  photoId?: string;      // scanned document/certificate — could point at the Phase 6 attachments
                          // table (app/lib/db/attachments.ts) instead of a new Photo row
}
```
- Birth/death on `Person` become sugar over an implicit `LifeEvent`, or stay as-is and let `LifeEvent`
  be strictly additive — avoids a breaking schema migration.
- UI: an "Events" tab in the detail panel, a `<SourcePicker>` similar to the existing `<PersonPicker>`,
  inline citation badges next to any sourced fact.
- Places could later support a map view, but that's a separate, larger feature — don't couple it to
  this one. (Live map tiles would also break the offline constraint — a bundled low-res static map is
  the only version consistent with ADR D18.)
- Should be scoped as its own multi-step plan rather than one PR.

---

## 5. Relationship path finder ("how is X related to Y?")

**Status:** Not started.

**Problem:** No way to answer "how are these two people connected" beyond manually tracing the
canvas.

**Proposal:**
- Pure graph algorithm, no schema changes: BFS from both `X` and `Y` over the undirected relationship
  graph (parent-child edges traversed both directions, plus spouse edges), meeting in the middle.
- Present the path as a plain-language description (e.g. "X is Y's spouse's brother's daughter") —
  this description-generation step is the actually-hard part, not the BFS. Needs a small rules engine
  mapping path shapes to relationship terms, including "N times removed" for cross-generation cousins.
- Reasonable to scope the language generator to direct lineage + siblings + first-order cousins for a
  first version, with a fallback "connected via: A → B → C" raw-path display for anything more exotic.
- UI: a two-person picker (reuse `<PersonPicker>`) from `/people` or a canvas toolbar action; highlight
  the path on the canvas when invoked from there.

---

## 6. Timeline view

**Status:** Not started. Depends on §4 for anything richer than birth/death.

**Problem:** The only view of the data is the tree canvas; no chronological view of events across the
family.

**Proposal:**
- A timeline of just birth/death dates is a much smaller, shippable-sooner version than the full
  life-events one.
- Rendering: a horizontal axis scaled by year, one row per person (or per family/branch), event
  markers plotted along each row. Hand-rolled linear scale (matching the project's lean-dependency
  posture) for the axis; plain SVG/DOM for markers.
- Default to "scoped to the currently open tree" for consistency with the family book and statistics
  (ADR D22), with a possible whole-pool toggle later.
- Interaction: clicking an event jumps to that person on the canvas.

---

## 7. Multi-page PDF tiling

**Status:** Not started.

**Problem:** Both PDF exports (canvas export, and the Phase 6 family book) scale to fit a fixed page
size — a large tree canvas becomes illegibly small when tiled to one page.

**Proposal:**
- Extend `app/lib/export/pdf.ts`: instead of one `fitView` capture, compute a grid of viewport rects
  covering the full graph bounds at a fixed, legible scale, capture each tile via `html-to-image`, and
  place each as its own PDF page via `jsPDF.addPage()`.
- Needs overlap margins between tiles and simple crop-mark or page-number annotations so physical
  pages can be reassembled.
- Tile order: row-major left-to-right, top-to-bottom.
- Should reuse the same `fitView`-then-capture mechanism already in place, parameterized by tile rect
  instead of the whole-graph rect.

---

## 8. Radial / alternative layouts

**Status:** Not started.

**Problem:** Exactly one layout ships: ELK's `layered` algorithm, top-down (or left-to-right, per
Phase 3) generational rows.

**Proposal:**
- ELK itself supports alternative algorithms (`radial`, `mrtree`, `force`) — swapping the algorithm
  string in `app/lib/layout/use-elk-layout.ts` is the cheap first step, but each produces a different
  node/edge shape that the existing `PersonNode`/`UnionNode` renderers and the position-override model
  (ADR D9) need to keep working with.
- Radial (ancestor-fan / pedigree-chart style) is the most commonly requested alternative and
  meaningfully different from the current descendant-oriented layered graph — likely wants its own
  adapter (parallel to `app/lib/graph/to-elk-graph.ts`) since a pedigree fan typically shows only
  direct ancestors of one focus person, not the whole union-derived graph.
- UI: a layout picker in the tree toolbar; persist the chosen layout per-tree or per-session.
- Position overrides are layout-specific — switching layouts should warn that it clears overrides, or
  namespace overrides per layout mode (same open question Phase 3 left for its direction toggle).

---

## 9. JSON-import merge/dedup

**Status:** Not started. Phase 2 built exactly the machinery this needs — `mergePeople`
(`app/lib/db/merge-people.ts`) and `findDuplicates` (`app/lib/analysis/duplicates.ts`) — so this is
now the tractable starting point it wasn't when first proposed.

**Problem:** JSON import is replace-only (ADR D13) — fine for backup/restore, but blocks combining two
independently-built trees.

**Proposal:**
- Identity resolution is the core problem: no stable external ID exists (`Person.id` is locally
  generated), so matching has to be heuristic — name (fuzzy/normalized) + birth year (exact or ±1) +
  shared parent/spouse links as corroborating signal. `findDuplicates`' existing disqualifier rules
  (never flag an already-related pair, a shared surname alone is never enough, >2 years apart rules a
  pair out) are the right starting rule set.
- UX: after parsing the incoming envelope, show a review screen listing likely-duplicate pairs
  (score-ranked) with "merge" / "keep both" per pair, plus a bulk "import everyone else as new" action.
  Never auto-merge silently.
- Merge semantics: reuse `mergePeople`'s existing relationship re-pointing and `TreeMember`
  de-duplication rather than writing a second version of that logic.
- This is also the mechanism §3 (GEDCOM import) should reuse, so building it against the JSON envelope
  format first (smaller surface, already-validated schema) is the right order.

---

## 10. Mobile-specific interaction design

**Status:** Not started. Desktop-first remains the standing decision (ADR D15).

**Problem:** Touch works via React Flow's built-in support; no dedicated mobile interaction design
exists for anything built on top of it.

**Proposal:**
- Audit against the app's actual interactions as they exist today (detail panel, add-relative menu,
  Phase 5's keyboard shortcuts and drag-to-connect, Phase 3's canvas toolbar): pan/zoom/select work out
  of the box, but a fixed side panel and hover-dependent affordances (disabled-state tooltips,
  right-click-style menus) don't translate directly to touch.
- Concrete gaps likely worth addressing first: the detail side panel as a bottom sheet or full-screen
  overlay below some viewport width; tap-triggered equivalents for disabled-state tooltips; a "move
  mode" toggle for drag-to-reposition, since a plain drag is indistinguishable from pan/select on small
  targets; drag-to-connect (Phase 5) needs the same consideration.
- Responsive layout breakpoints for `/people` (table view) — likely needs a card-list view below
  tablet width.
- Should start with a UX audit on an actual touch device (or simulator) against every existing flow,
  cataloguing specific breakages, before writing any code.
- **Natural pairing:** high-contrast mode and an automated accessibility audit (ADR D35) are the other
  two open UX/robustness items with no data-model dependency — worth scoping together.

---

## 11. Undo/redo

**Status:** Not started. Standing decision unchanged (ADR D16).

**Problem:** Every mutation (person edits, relationship changes, deletes, layout resets) is immediate
and permanent, modulo the D3/D4 delete-confirmation dialog.

**Proposal:**
- Command-pattern history: every mutating operation in `app/lib/db/*` already goes through a small set
  of functions (`createPerson`, `updatePerson`, `deletePerson`, `addRelationship`,
  `removeRelationship`, tree/member mutations, `mergePeople`) — wrap each with a paired inverse
  operation and push `{do, undo}` onto an in-memory stack as they're called, rather than snapshotting
  the whole DB per action.
- Scope: session-only undo stack (cleared on reload) is a reasonable first version — durable/persisted
  undo history across sessions is a much bigger lift and isn't obviously worth it given destructive
  actions already require confirmation.
- Cascading deletes are the hard case: undoing a person-delete means restoring the person, all their
  relationships, all their `TreeMember` rows, their photos (plural, since Phase 6), and any
  attachments — the inverse operation needs to capture that full snapshot at delete time. (Phase 4's
  rolling snapshots, ADR D25, are a related but distinct mechanism — a manual/scheduled whole-pool
  point-in-time copy, not a per-action undo stack. Don't conflate the two.)
- UI: standard toolbar undo/redo buttons + `Cmd/Ctrl+Z` / `Shift+Cmd/Ctrl+Z`, scoped globally since some
  mutations (person edits from `/people`) aren't tree-scoped at all.
- An undo that removes/re-adds a node should re-trigger auto-layout recompute, same as the original
  mutation did (ADR D9).

---

## Shipped since this document was last written

Everything below was a proposal here and is now built. Kept as a pointer to the ADR entry that
records the decisions actually made, not as a changelog — see git history (PRs #15–#22) for the
implementation detail.

| Shipped | ADR entries |
|---|---|
| Sex, subtype-of-relationship, maiden name, nickname, multiple births, custom fields, and the data-quality validator | D19, D20 |
| Family statistics, birthdays/anniversaries, `.ics` export, duplicate detection, merge people | D20, D21, D23 |
| Focus/bloodline views, layout direction, connector shapes, card content, colour groups, theme toggle | — (see Phase 3 in git history if the reasoning is needed beyond what ADR captures) |
| Storage breakdown, rolling snapshots, local-folder auto-backup, staleness nudge, multi-tab safety | D24, D25, D26, D27 |
| Keyboard-driven canvas, drag-to-connect, "add whole family", multi-select/align, inline table editing, CSV import/export, markdown notes | D23, D32, D33 |
| Multiple photos per person, document attachments, photo wall, family-book PDF, living-person redaction | D28, D29, D30 |
| Bundled sample tree, offline help, canvas accessibility pass | D31, D34 |
