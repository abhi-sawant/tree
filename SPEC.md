# Family Tree Generator — Technical Spec

**Status:** Draft v1
**Type:** Offline-first, installable React PWA
**Last updated:** 2026-08-29

---

## 1. Positioning

A general-purpose family tree builder that runs entirely in the browser. No account, no server, no network dependency after install.

| Decision | Value |
|---|---|
| Audience | General public |
| Scale target | A few hundred people per user |
| Data location | Local only (IndexedDB) |
| Backup model | Manual export, user-owned |
| Person record | Minimal |

Medium scale is comfortably within IndexedDB and React Flow limits without node virtualization work.

---

## 2. Data model

### 2.1 The core decision

Trees are **named views over one shared graph**, not separate databases. A person exists once in a global pool and can be a member of any number of trees.

### 2.2 Entities

```ts
type PartialDate = {
  year?: number;
  month?: number;
  day?: number;
  approximate?: boolean;
};

interface Person {
  id: string;
  givenName: string;
  familyName?: string;
  birth?: PartialDate;
  death?: PartialDate;
  photoId?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

interface Relationship {
  id: string;
  type: 'parent-child' | 'spouse';
  from: string;          // parent, or spouse A
  to: string;            // child, or spouse B
  start?: PartialDate;   // marriage date
  end?: PartialDate;     // divorce / separation
}

interface Tree {
  id: string;
  name: string;
  rootPersonId: string;
  createdAt: number;
}

interface TreeMember {
  treeId: string;
  personId: string;
  x?: number;            // manual position override
  y?: number;
}

interface Photo {
  id: string;
  blob: Blob;
  mime: string;
}
```

### 2.3 Consequences of the shared pool

**Position lives on `TreeMember`, not `Person`.**
One person appears in multiple trees; a single `x/y` on the person would conflict across views.

**Removing from a tree ≠ deleting the person.**
Two distinct destructive actions, each needing unambiguous UI language. Deleting the underlying person must warn which other trees are affected.

**Relationships are global.**
If A is B's parent, that holds in every tree. A tree only decides who is *displayed*. Therefore "add existing person to this tree" should offer to pull in their immediate relatives, or trees will render as disconnected islands.

### 2.4 Dates

Use `PartialDate` from day one. Genealogy data is full of bare years and "circa 1890". `Date` cannot represent this, and retrofitting is expensive — it touches storage, forms, sorting, GEDCOM output, and display formatting simultaneously.

### 2.5 Union nodes

Family trees are not trees graph-theoretically: two parents per child, remarriage, and cousin marriage all create cross-links.

Standard solution: a **union node** joining a couple, with children attached to the union rather than to individual parents. This makes the graph a clean DAG for the layout engine and makes "children of this marriage" unambiguous.

Build this in from the start. Adding it later means reworking both the schema and the renderer.

Union nodes are **derived at render time** from spouse relationships — they are not stored.

---

## 3. Features

### 3.1 Building the tree

**Canvas-first.** Select a node, then contextual actions:

- Add parent
- Add spouse
- Add child
- Add sibling

Each opens a compact inline form and creates the person plus the relationship in a single step. This is the primary loop and must be fast — expect users to add 30+ people in one sitting.

*Add sibling* is sugar over "add child to the selected person's parents". If the person has no parents recorded, prompt to create a placeholder parent or block the action.

**List view** is the secondary path: a searchable table of the whole person pool. Used for bulk editing, finding someone in a large tree, and adding an existing person to another tree. Essential given the shared pool.

### 3.2 Layout

Auto-layout with persisted manual overrides.

1. `elkjs` (`layered` algorithm) computes positions
2. Computed positions apply only to nodes with no saved override
3. Dragging a node writes `x/y` to `TreeMember`; auto-layout no longer touches it

Required affordances:

- **Re-layout tree** — clear all overrides, recompute
- **Reset node** — clear a single override
- Visual indicator that a node has been manually placed

Without these, override behaviour becomes frustrating and opaque.

### 3.3 Person record

Name (given / family), birth date, death date, one photo, free-text notes.

This is deliberately minimal and simplifies forms, GEDCOM mapping, and future import. Resist scope creep here — occupation, places, and events can come later without breaking the schema.

### 3.4 Multiple trees

- Create, rename, delete trees
- Each tree has a root/anchor person
- Add existing people from the pool to a tree
- Remove from tree vs. delete person — distinct, clearly labelled

---

## 4. Export

| Format | Approach |
|---|---|
| **JSON backup** | Versioned envelope: `{ schema: 1, people, relationships, trees, members }`. Photos base64-inlined, or `.zip` with manifest if size becomes an issue. |
| **PNG / SVG** | `html-to-image` over the React Flow viewport. Fit-to-bounds before capture so off-screen nodes are included. |
| **PDF** | `jsPDF` wrapping the PNG, with title and generated-date header. v1 scales to fit one page; multi-page tiling is deferred. |
| **GEDCOM 5.5.1** | Export only in v1. |

### 4.1 GEDCOM mapping

The minimal person record maps almost 1:1:

- `INDI` → `NAME`, `BIRT/DATE`, `DEAT/DATE`, `NOTE`
- `SEX` omitted (not collected)
- Spouse + children → `FAM` records

Hand-roll the writer. It is roughly 150 lines of line-tagged text output and needs no dependency.

### 4.2 GEDCOM import (deferred)

Parsing is straightforward (`read-gedcom` handles it). The hard part is **merging imported people against the existing pool** — a genuine deduplication problem requiring match heuristics and a review UI. Correctly deferred past v1.

---

## 5. Storage and data loss

**Decision: manual export only.** No auto-backup, no reminders.

### 5.1 The risk

IndexedDB is evictable:

- iOS Safari may clear data after ~7 days without a site visit
- Chrome evicts under storage pressure

For an app where a user may spend two hours entering family history, silent loss is the worst possible failure mode.

### 5.2 Two cheap mitigations

These do not change the manual-export decision:

1. **`navigator.storage.persist()`** on first meaningful write. One line. Prompts the browser to exempt data from eviction, and is granted automatically when the app is installed as a PWA — a real argument for surfacing the install prompt early.
2. **Visible storage state** in settings: whether storage is persisted, and the date of last export.

No nagging. Just make the risk legible.

---

## 6. Tech stack

| Concern | Choice | Note |
|---|---|---|
| Build | Vite + React 19 + TypeScript (strict) | |
| Routing | React Router 7 | `/tree/:id`, `/people`, `/settings` |
| Styling | Tailwind + shadcn/ui | |
| Canvas | `@xyflow/react` | Custom person nodes + union nodes |
| Layout | `elkjs` | `layered` algorithm, run in a web worker |
| Storage | Dexie.js over IndexedDB | `liveQuery` for reactive reads |
| UI state | Zustand | Selection, panel state, viewport |
| PWA | `vite-plugin-pwa` | `registerType: 'prompt'` |
| Validation | Zod | JSON import path only |
| Image export | `html-to-image` | |
| PDF export | `jsPDF` | |
| Testing | Vitest + React Testing Library | |

### 6.1 Service worker

Precache the app shell. Nothing else. There are no network requests to cache — all data is local. Offline works because there is nothing to be offline *from*.

`registerType: 'prompt'` rather than `autoUpdate`, so users are never reloaded mid-edit.

### 6.2 Test priorities

Two areas deserve dedicated unit tests independent of the UI:

- GEDCOM writer (output correctness against known fixtures)
- Graph → ELK adapter (union node derivation, DAG validity)

---

## 7. Build order

Steps 1–6 constitute the real application. Everything after is additive.

1. Dexie schema, Zod types, `PartialDate` utilities
2. Person CRUD and list view — prove the data layer with no canvas
3. Relationship model with union node derivation; layout-ready graph
4. React Flow canvas with ELK auto-layout, read-only
5. Canvas editing: add parent / spouse / child / sibling
6. Position overrides and re-layout controls
7. Multiple trees, membership, add-existing-person
8. Photos
9. JSON export / import
10. PNG / PDF export
11. GEDCOM export
12. PWA manifest, service worker, install prompt, `storage.persist()`

---

## 8. Explicitly out of scope for v1

- Cloud sync or multi-device
- User accounts
- GEDCOM import
- Sources, citations, life events, places
- Relationship path finder ("how is X related to Y")
- Timeline view
- Multi-page PDF tiling
- Radial / alternative layouts