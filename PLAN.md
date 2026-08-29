# Family Tree Generator — Implementation Plan

**Based on:** [SPEC.md](./SPEC.md) + grilling session, 2026-08-29
**Status:** Ready to implement

This plan sequences the work in [SPEC.md §7](./SPEC.md#7-build-order)'s order, with every decision from the grilling
session folded into the step where it applies. Steps 1–6 are the real application; 7–12 are additive.

---

## 0. Decisions log

Reference table for anything that isn't already nailed down in SPEC.md. Each row is load-bearing — cite the row
number in code comments only if the *why* isn't obvious from context.

| # | Decision |
|---|---|
| D1 | Switch scaffold to SPA mode (`ssr: false`). Delete `Dockerfile`, `@react-router/serve` start script, server deploy path. Static hosting only. |
| D2 | Selecting a canvas node opens a persistent detail/edit side panel (view + edit person fields, list relationships, contextual add-actions) — not just transient "add X" forms. |
| D3 | Deleting a person cascades: their relationships, their `TreeMember` rows in every tree, and their `Photo` blob are all deleted, after a confirmation dialog listing affected trees. |
| D4 | If the person is the root of one or more trees, deletion is **blocked** with an actionable message ("X is the root of trees: A, B — reassign root before deleting"). No silent auto-reassignment. |
| D5 | "Add sibling" with no recorded parents creates a placeholder parent automatically rather than blocking. |
| D6 | `Person` gets an explicit `isPlaceholder?: boolean` field. Placeholders are visually flagged (badge, dashed border) but otherwise treated as normal people everywhere (List view, search, exports). A List-view filter can hide them; that filter never applies to exports. |
| D7 | Relationship validation: max 2 `parent-child` relationships per child (block a 3rd with an error); unlimited `spouse` relationships per person over time; block self-reference and direct cycles. |
| D8 | Union-node derivation: a child with one recorded parent attaches directly to that parent (no union node). Two people who both parent the same child but have no recorded `spouse` relationship get a synthesized **implicit union** for rendering only (not stored), promotable to a real `spouse` relationship via D10. |
| D9 | ELK layout recomputes automatically (non-overridden nodes only) after every graph mutation. "Re-layout tree" clears all overrides and recomputes everything; "Reset node" clears one override. |
| D10 | Detail panel includes "Add spouse (existing person)" / "Add parent (existing person)" — search-select a second person from the pool instead of always creating a new one. Reuses D7/D8 validation and derivation as-is. |
| D11 | "Add existing person to tree" dialog has a pre-checked checkbox: "Also add their immediate family — N people" (parents + spouse + children) as additional `TreeMember`s. |
| D12 | Root person is a pure layout anchor + integrity guard: can't be removed from tree membership, and the person can't be deleted from the pool (D4), without reassigning root first. Otherwise it has no effect on what's displayed. |
| D13 | JSON import is replace-only (wipes local DB, restores from the envelope). Reject mismatched `schema` version with a clear error. No merge/dedup in v1. |
| D14 | GEDCOM export always covers the entire global pool, never scoped to the currently-open tree. |
| D15 | Desktop-first. Touch works via React Flow's built-in support; no dedicated mobile interaction design in v1. |
| D16 | No undo/redo in v1. |
| D17 | Photos are resized/compressed client-side on upload (max 800px longest edge, JPEG ~80%) before being stored as a `Blob`. |

---

## 1. Project setup (precursor to Step 1)

Before touching the data layer, fix the scaffold/spec mismatch and install the real dependency set.

- [ ] `react-router.config.ts`: set `ssr: false` (D1)
- [ ] Delete `Dockerfile`; remove `start`/`@react-router/serve` references from `package.json` scripts; update `README.md`
- [ ] Install: `@xyflow/react elkjs dexie zustand zod html-to-image jspdf vite-plugin-pwa`
- [ ] Install dev deps: `vitest @testing-library/react @testing-library/jest-dom jsdom`
- [ ] Add `vitest.config.ts` (or extend `vite.config.ts`) wired to jsdom
- [ ] Confirm `app/routes.ts` will host `/tree/:id`, `/people`, `/settings` (SPEC §6) — scaffold current has only `home.tsx`; plan the redirect: `/` → most-recently-opened tree, or a "create your first tree" empty state if none exists

**Acceptance:** `npm run dev` serves a client-only SPA; `npm run build` produces a static `build/client` with no server bundle.

---

## 2. Step 1 — Dexie schema, Zod types, `PartialDate` utilities

**Files:** `app/lib/db/schema.ts`, `app/lib/db/db.ts`, `app/lib/types.ts`, `app/lib/partial-date.ts`

### 2.1 Types (`app/lib/types.ts`)

Port the interfaces from SPEC §2.2 verbatim, plus D6:

```ts
interface Person {
  id: string;
  givenName: string;
  familyName?: string;
  birth?: PartialDate;
  death?: PartialDate;
  photoId?: string;
  notes?: string;
  isPlaceholder?: boolean; // D6
  createdAt: number;
  updatedAt: number;
}
```

`Relationship`, `Tree`, `TreeMember`, `Photo` — unchanged from spec.

### 2.2 Zod schemas (`app/lib/schemas.ts`)

Mirror every interface for the JSON-import validation path (SPEC §6, Zod row). Include a top-level
`BackupEnvelopeSchema` for `{ schema: 1, people, relationships, trees, members }` used by D13.

### 2.3 `PartialDate` utilities (`app/lib/partial-date.ts`)

- `formatPartialDate(pd?: PartialDate): string` — e.g. "1890", "Mar 1890", "12 Mar 1890", prefixed "c. " when `approximate`
- `comparePartialDate(a?, b?): number` — for sort (undefined sorts last; missing month/day treated as earliest-in-period)
- `partialDateToGedcomDate(pd?: PartialDate): string` — GEDCOM date grammar (`ABT 1890`, `MAR 1890`, `12 MAR 1890`) for Step 11
- Unit tests: formatting edge cases (year-only, approximate, full date), comparison ordering, GEDCOM conversion

### 2.4 Dexie schema (`app/lib/db/db.ts`)

```ts
class FamilyTreeDB extends Dexie {
  people!: Table<Person, string>;
  relationships!: Table<Relationship, string>;
  trees!: Table<Tree, string>;
  members!: Table<TreeMember, string>; // compound key [treeId+personId]
  photos!: Table<Photo, string>;
}
```

- Indexes: `people` by `givenName+familyName` (List view search), `relationships` by `from`, `to`, `type`; `members` by `treeId`, `personId`
- `members` primary key is `[treeId+personId]` (compound) — enforces one membership row per person per tree
- Use `liveQuery` wrappers exposed as hooks (`usePerson`, `usePeople`, `useTreeMembers`, etc.) — Step 2 consumes these

**Acceptance:** Vitest covers `PartialDate` utilities. A scratch script or test seeds a person/relationship and reads it back via `liveQuery`.

---

## 3. Step 2 — Person CRUD and list view (no canvas)

**Files:** `app/routes/people.tsx`, `app/lib/db/people.ts`, `app/components/people/*`

### 3.1 Data layer (`app/lib/db/people.ts`)

- `createPerson`, `updatePerson`, `deletePerson` (implements D3/D4 cascade + root guard — see 3.4), `getPerson`, `searchPeople(query, { includePlaceholders })`

### 3.2 List view route (`/people`)

- Searchable/sortable table: name, birth date, death date, placeholder badge (D6), which tree(s) they belong to
- Row actions: edit (opens same detail panel as canvas — D2), delete, "add to tree"
- Filter toggle: "Show placeholders" (D6), on by default
- This is also where D10's "existing person" search-select is implemented as a reusable `<PersonPicker>` component, since it's needed here (add-to-tree) and later in the canvas (Step 5)

### 3.3 Person form (create/edit)

- Fields: given name, family name, birth `PartialDate` (year/month/day/approximate), death `PartialDate`, notes, photo (stubbed until Step 8)
- Shared between "create new" (canvas quick-add, Step 5) and "edit existing" (D2 detail panel) — one form component, different submit handlers

### 3.4 Delete flow (D3/D4)

- `deletePerson(id)`:
  1. Look up `Tree` rows where `rootPersonId === id`. If any exist → throw a typed error the UI turns into "X is the root of trees: A, B — reassign root before deleting." Abort, no partial deletion.
  2. Otherwise: collect affected trees (via `members` where `personId === id`), show confirmation dialog naming them
  3. On confirm: delete all `relationships` where `from === id || to === id`; delete all `members` rows for this person; delete the `Photo` row and blob if `photoId` is set; delete the `Person` row — as one Dexie transaction

**Acceptance:** Full CRUD works from `/people` with no canvas. Deleting a non-root person cascades correctly; deleting a root is blocked with the correct message. Vitest covers the cascade and the block.

---

## 4. Step 3 — Relationship model, union-node derivation, layout-ready graph

**Files:** `app/lib/db/relationships.ts`, `app/lib/graph/derive-unions.ts`, `app/lib/graph/to-elk-graph.ts`

### 4.1 Relationship data layer (D7)

- `addRelationship(type, from, to, dates?)`:
  - `parent-child`: reject if `to` already has 2 `parent-child` relationships as child (unless replacing/editing); reject if `from === to`; reject if adding this edge would create a cycle (walk ancestors of `from` looking for `to`, and descendants of `to` looking for `from`)
  - `spouse`: no cap; reject `from === to`
- `removeRelationship(id)`

### 4.2 Union derivation (D8) — `app/lib/graph/derive-unions.ts`

Pure function, `deriveUnions(people, relationships) => UnionNode[]`, run at render time (never persisted):

1. Group `parent-child` relationships by child → list of parent ids per child
2. For each child with exactly 2 parents: look for an existing `spouse` relationship between those two parents
   - Found → this is the union node for that couple (spouse dates flow through for display)
   - Not found → synthesize an **implicit union** (`{ kind: 'implicit', parents: [a, b] }`) with no dates
3. For each child with exactly 1 parent: no union node; render the child attached directly to that parent (D8)
4. A single couple's union node aggregates *all* their shared children, across however many `parent-child` rows reference them

Implicit unions carry enough info for D10's "record marriage" action (pre-fills both people into the "add spouse (existing)" flow from the union node's context menu).

### 4.3 Graph → ELK adapter (`app/lib/graph/to-elk-graph.ts`)

- Input: people + relationships (+ derived unions) scoped to one tree's `TreeMember`s
- Output: ELK graph JSON (nodes = people + union nodes, edges = person→union and union→child)
- Must produce a valid DAG — union nodes are exactly what makes this possible despite remarriage/cousin-marriage cross-links (SPEC §2.5)
- Unit tests: union derivation for (a) two-parent-with-spouse-record, (b) two-parent-no-spouse-record (implicit), (c) one-parent-only, (d) remarriage (one person, two unions, children split correctly), (e) resulting graph has no cycles for any of the above

**Acceptance:** Given a hand-built fixture of people/relationships, `deriveUnions` + `toElkGraph` produce correct, cycle-free output — verified by dedicated Vitest suite (SPEC §6.2 test priority #2).

---

## 5. Step 4 — React Flow canvas with ELK auto-layout (read-only)

**Files:** `app/routes/tree.$id.tsx`, `app/lib/layout/elk-worker.ts`, `app/components/canvas/*`

### 5.1 ELK web worker

- `elk-worker.ts` runs `elkjs`'s `layered` algorithm off the main thread
- Message protocol: `{ graph, overriddenNodeIds }` in → `{ positions: Record<nodeId, {x,y}> }` out
- Positions apply only to nodes *not* in `overriddenNodeIds` (D9) — the worker itself is layout-only and doesn't know about persistence

### 5.2 Canvas route (`/tree/:id`)

- `@xyflow/react` viewport; custom node types: `PersonNode`, `UnionNode` (renders as a small dot/bar, not a card)
- Load: tree members → build graph (Step 3 adapter) → run ELK worker → merge computed positions with any saved `TreeMember.x/y` overrides → render
- Read-only in this step: pan/zoom/select work, no mutation yet

**Acceptance:** Opening a tree renders a correctly laid-out, non-overlapping graph, including couples/remarriage cases, entirely from persisted data.

---

## 6. Step 5 — Canvas editing: add parent / spouse / child / sibling

**Files:** `app/components/canvas/detail-panel.tsx`, `app/components/canvas/add-relative-menu.tsx`

### 6.1 Selection → detail panel (D2)

Selecting a node opens a side panel:
- View/edit the person's fields (reuses the Step 2 form)
- Lists their relationships (parents, spouses with dates, children) with per-relationship edit (dates) / remove
- Contextual actions, each offering **both** a "new person" and "existing person" variant (D10):
  - Add parent (new / existing) — blocked past 2 parents (D7), surfaced as a disabled state + tooltip, not a dead click
  - Add spouse (new / existing) — also reachable from an implicit union node's context menu, pre-filled (D8→D10 "record marriage")
  - Add child (new / existing) — if the selected node is a union, child attaches to both parents; if a single person with no union, attaches to just them
  - Add sibling — sugar over "add child to selected person's parents"; if none recorded, auto-creates a placeholder parent first (D5), then proceeds
- "Existing person" variants open the `<PersonPicker>` component built in Step 3

### 6.2 Mutation → re-layout (D9)

Every add/remove above writes to Dexie, then triggers ELK recompute for non-overridden nodes (via the Step 5 worker), so new nodes never render at `(0,0)`.

**Acceptance:** All four contextual actions work end-to-end from the canvas, including the existing-person variants and the parent-cap/cycle guards from Step 3 surfacing as visible UI feedback, not silent failures.

---

## 7. Step 6 — Position overrides and re-layout controls

**Files:** extend `app/components/canvas/*`, `app/lib/db/members.ts`

- Node drag → `onNodeDragStop` writes `x/y` to that `TreeMember` row; from then on this node is excluded from auto-layout (D9)
- Visual indicator on manually-placed nodes (e.g. a small pin icon)
- Toolbar actions:
  - **Re-layout tree** — clear all `x/y` overrides in this tree's members, recompute everything
  - **Reset node** (per-node, from its context menu or the detail panel) — clear just that one override

**Acceptance:** Drag persists across reload; re-layout and per-node reset both behave as specced; auto-layout never fights a manual placement it doesn't own.

---

## 8. Step 7 — Multiple trees, membership, add-existing-person

**Files:** `app/routes/tree.$id.tsx` (tree switcher), `app/components/trees/*`, `app/lib/db/trees.ts`

- Tree CRUD: create (pick or create a root person during creation), rename, delete (deletes `Tree` + its `members` rows only — never touches `people`/`relationships`, per SPEC §2.3)
- Root reassignment UI (needed for D4/D12's guard): a "change root" action listable from tree settings, which is the *only* way to make a blocked deletion (D4) or a blocked membership-removal (D12) proceed
- "Add existing person to tree" flow (via `<PersonPicker>`): pre-checked "Also add their immediate family — N people" checkbox (D11), computing the count (parents + spouse(s) + children of the picked person, deduped against people already in this tree) before showing the dialog
- "Remove from tree" vs "Delete person" — two distinctly labeled actions in the same context menu, per SPEC §3.4; removing the root is blocked (D12) with the same reassign-first messaging as D4

**Acceptance:** A person can belong to N trees with independent positions; removing from a tree never touches the global person/relationship data; root guard is enforced on both delete-person and remove-from-tree paths.

---

## 9. Step 8 — Photos

**Files:** `app/lib/photos.ts`, extend person form

- Upload → client-side resize/compress (D17: canvas-based downscale to max 800px longest edge, re-encode JPEG ~80% quality) → store as `Photo.blob` in Dexie, `Person.photoId` set
- Display: thumbnail in `PersonNode`, larger preview in detail panel/list view
- Replacing a photo deletes the old `Photo` row (avoid orphaned blobs); deleting a person deletes their `Photo` too (already covered in Step 2's cascade, §3.4)

**Acceptance:** Uploading a large phone photo results in a small stored blob; JSON export size stays bounded (validates the reasoning behind D17).

---

## 10. Step 9 — JSON export / import

**Files:** `app/lib/export/json.ts`, `app/routes/settings.tsx`

- **Export:** dump entire pool as `{ schema: 1, people, relationships, trees, members }`; inline photos as base64 (`data:` URIs) keyed by `photoId`; trigger browser download
- **Import (D13, replace-only):**
  1. Parse + validate against `BackupEnvelopeSchema` (Zod)
  2. Reject if `schema !== 1` with a clear "unsupported backup version" error
  3. Confirm with the user that this **replaces all current data** (destructive, needs explicit confirmation per this session's action-safety rules)
  4. On confirm: clear all Dexie tables, decode base64 photos back to blobs, bulk-insert everything in one transaction

**Acceptance:** Export → import round-trips to an identical state. Importing a corrupt or wrong-version file fails loudly before touching the DB.

---

## 11. Step 10 — PNG / PDF export

**Files:** `app/lib/export/image.ts`, `app/lib/export/pdf.ts`

- Before capture: temporarily fit the React Flow viewport to bounds (`fitView`) so off-screen nodes are included, per SPEC §4
- PNG/SVG via `html-to-image` over the viewport DOM node
- PDF via `jsPDF`: embed the PNG, add a title + generated-date header, scale-to-fit one page (multi-page tiling explicitly deferred per SPEC §8)

**Acceptance:** Exported image/PDF includes every node in the current tree, not just the visible viewport.

---

## 12. Step 11 — GEDCOM export

**Files:** `app/lib/export/gedcom.ts` (hand-rolled writer, ~150 lines per SPEC §4.1)

- Scope: **entire global pool** always (D14), independent of which tree is open
- Mapping (SPEC §4.1): `INDI` → `NAME`/`BIRT.DATE`/`DEAT.DATE`/`NOTE`; `SEX` omitted; couples + shared children → `FAM` records
- Use derived unions (Step 3) to build `FAM` groupings, including implicit unions (D8) — GEDCOM has no concept of "unmarried," so implicit unions still emit a `FAM` record, just without a marriage `DATE`
- Dates via `partialDateToGedcomDate` (Step 1)
- Placeholders (D6) are exported like anyone else — they're structurally real nodes in the family graph
- Unit tests against known-good fixture output (SPEC §6.2 test priority #1): a small hand-built family (remarriage + one placeholder parent + one implicit union) with expected `.ged` text

**Acceptance:** Output validates against GEDCOM 5.5.1 structure for the fixture family; dedicated Vitest suite passes.

---

## 13. Step 12 — PWA manifest, service worker, install prompt, `storage.persist()`

**Files:** `vite.config.ts` (add `vite-plugin-pwa`), `app/lib/storage.ts`, `app/routes/settings.tsx`

- `vite-plugin-pwa`: precache app shell only (no runtime caching needed — no network requests exist post-load, per SPEC §6.1); `registerType: 'prompt'` so users are never reloaded mid-edit
- Manifest: name, icons (need to generate a simple icon set — placeholder acceptable for v1), `display: standalone`
- Install prompt: surface it early (SPEC §5.2 — installing as PWA auto-grants persistent storage)
- `navigator.storage.persist()` called on first meaningful write (first person created)
- Settings page (`/settings`) shows: whether storage is persisted (`navigator.storage.persisted()`), date of last export (stored in a small `AppMeta` Dexie table or `localStorage`) — legible, not nagging, per SPEC §5.2

**Acceptance:** App installs as a standalone PWA; Lighthouse PWA checks pass; storage-persist status and last-export date are visible in Settings.

---

## 14. Cross-cutting: testing

Per SPEC §6.2, two suites are non-negotiable and should be written alongside their steps, not deferred:

- **Graph → ELK adapter** (Step 3): union derivation correctness, DAG validity — see 4.3
- **GEDCOM writer** (Step 11): fixture-based output correctness — see 12

Everything else (CRUD, cascade/root-guard logic, `PartialDate` utilities, JSON round-trip) gets lighter Vitest coverage as it's built; no dedicated component/integration test layer planned for v1 beyond that — matches the spec's minimal testing posture.

---

## 15. Explicitly deferred (unchanged from SPEC §8)

Cloud sync, accounts, GEDCOM import, sources/citations/events/places, relationship path finder, timeline view,
multi-page PDF tiling, radial/alternative layouts, JSON-import merge/dedup (D13), mobile-specific interaction design (D15), undo/redo (D16).
