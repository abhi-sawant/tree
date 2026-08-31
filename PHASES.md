# Family Tree v2 — Phase Programme

**Purpose:** a self-contained handoff document. Anyone (or any new session) picking up this work
should be able to read only this file plus `SPEC.md` and continue without re-deriving anything.

**Status:** Phase 1 and Phase 2 complete and merged/branched. Phase 3 in progress.

---

## 1. Where this came from

`SPEC.md` describes v1, which shipped. `FUTURE-SCOPE.md` lists v2 candidates, but its two headline
items — cloud sync and user accounts — would reopen `SPEC.md`'s D1 decision (static SPA, no server)
and break the app's defining property: **it works fully offline because there is nothing to be
offline from.**

A brainstorm pass over the actual code produced 43 further features that hold that constraint.
This document sequences them.

### The offline constraint is absolute

No feature may introduce a network dependency. This rules out, permanently:

- cloud sync, accounts, sharing links
- map tiles for place data (unless a static low-res world map is bundled)
- any LLM-assisted matching

### Dropped by explicit decision

| Dropped | Why |
|---|---|
| Voice memories (`MediaRecorder` audio per person) | Most distinctive idea on the list, but out of scope by choice |
| Encryption at rest (WebCrypto passphrase) | "Forgot passphrase = permanent data loss" is too severe a failure mode |
| i18n / localisation | Large mechanical refactor touching every string; would dominate a phase |

### Already implemented — do not re-propose

**Photo downscaling on import.** `resizeAndCompressImage` in `app/lib/photos.ts` already caps
uploads at an 800px longest edge and re-encodes to JPEG q0.8, and `person-form.tsx` calls it on
every upload. Only the *storage visibility* half of that idea remains (Phase 4).

So: 43 brainstormed − 3 dropped − 1 already done = **39 features to build.**

---

## 2. Working conventions

Follow these; they were established across Phases 1–2 and several exist because of a mistake made
once already.

### Git

- One branch per phase: `feat/v2-phase-N`. One PR per phase.
- **One focused commit per feature.** Every commit must pass `npm run typecheck` and
  `npm run test` on its own.
- Commit messages explain *why*, especially any judgement call or refusal. The bodies in Phases 1–2
  are the reference for tone and depth.

### Formatting — read this before running Prettier

**The repo is not Prettier-clean.** Its committed code predates some of its own `.prettierrc`
settings, so `npx prettier --write "app/**/*"` reformats ~23 files you did not touch and buries the
real diff in whitespace churn. This happened in Phase 1 and had to be reverted in commit `8e3a24d`.

**Only ever format the specific files you edited.** To check you haven't drifted:

```bash
for f in $(npx prettier --list-different "app/**/*.{ts,tsx}"); do git diff --name-only master...HEAD -- "$f" | grep -q . && echo "MINE: $f"; done
```

A repo-wide format is a reasonable thing to do — but on its own commit, not inside a feature branch.

### Testing

- Tests sit beside their subject as `*.test.ts`. Vitest + `fake-indexeddb`, already configured in
  `vitest.setup.ts`.
- Pure modules (`app/lib/analysis/*`, `app/lib/graph/*`, `app/lib/export/*`) carry the bulk of the
  coverage. `SPEC.md §6.2` names the GEDCOM writer and the graph adapters as the bar.
- Prefer injecting `Date` / `now` as a parameter over reading the clock, so behaviour is pinned.
- **Beware JS string escaping in test expectations.** `"\;"` silently becomes `";"`. Use
  `String.raw` for anything asserting on backslashes — this bit once, in the `.ics` escaping test.

### Data layer

- Mutations go through the helpers in `app/lib/db/*` (`createPerson`, `updatePerson`,
  `addRelationship`, `removeRelationship`, `mergePeople`, …). Never write to `db.*` from UI code.
- `CreatePersonInput` is derived from `PersonFormSchema`, so a new `Person` field only needs adding
  in `app/lib/schemas.ts` to flow through every create path.
- **Dexie only versions indexes.** Optional non-indexed fields need no `version()` bump. The schema
  is currently at `version(3)` (added the `sex` index).
- **No backup envelope bump needed for additive optional fields.** They flow through `PersonSchema`,
  so existing v1/v2 backups still validate. Old builds importing a new backup drop unknown fields
  (Zod strips them), which is acceptable.
- `relationships.ts` has no update path by design: editing is remove-then-add in one transaction.
  **Anything that rebuilds a relationship must carry every field forward explicitly** — this is how
  `updateRelationshipDates` silently dropped `subtype` until Phase 1 fixed it.

### Design principles established in Phases 1–2

These are load-bearing. Later phases should stay consistent with them.

1. **Never assert what the data doesn't settle.** A `PartialDate` denotes a *span*: "1950" is the
   whole of 1950, and an approximate date is widened further. Comparisons that could go either way
   report nothing. Use `definitelyBefore` / `minimumYearsBetween` / `maximumYearsBetween` from
   `app/lib/partial-date.ts` — **not** `comparePartialDate`, which collapses a bare year to 1
   January and is for sorting only.
2. **Aggregates may estimate; findings may not.** Statistics use plain year arithmetic and say how
   large the sample was. A validator finding must never fire on an undecidable comparison — a false
   accusation about someone's family is far worse than a missed one, and the reader can't tell them
   apart.
3. **Refuse rather than guess on destructive paths.** `mergePeople` stops when the two people are
   recorded as related, or when the result would breach the two-parent cap.
4. **Scoping is a deliberate choice each time.** Validator and duplicate detection are whole-pool
   ("belongs to no tree" is only meaningful pool-wide). Statistics are scoped to the open tree
   ("the average lifespan in my family" means the family on screen). File exports are whole-pool
   per `D14`.
5. **Share the rule, not the copy.** `exactCalendarDay` is exported from `anniversaries.ts` and used
   by the `.ics` writer so the two cannot disagree about which dates are real. `personDisplayName`
   is the single place a name is assembled for display.

---

## 3. Roadmap

39 features across 7 phases, dependency-ordered.

| Phase | Theme | Count | Status |
|---|---|---|---|
| 1 | Model fidelity & the validator | 7 | ✅ Complete, merged (PR #15) |
| 2 | Derived insight | 5 | ✅ Complete on `feat/v2-phase-2` |
| 3 | Canvas navigation & readability | 7 | 🚧 In progress |
| 4 | Durability | 5 | Not started |
| 5 | Fast entry | 7 | Not started |
| 6 | Media & output | 5 | Not started |
| 7 | Polish & reach | 3 | Not started |

---

## Phase 1 — Model fidelity & the validator ✅

Merged to `master` via PR #15. 8 commits.

| Feature | Commit |
|---|---|
| `Person.sex` + GEDCOM `SEX` and sex-driven `HUSB`/`WIFE` ordering | `ed3788c` |
| Maiden name, nickname, search recall, `personDisplayName` | `767f409` |
| Parent-child `subtype`, dashed edges, `PEDI` | `7f82b49` |
| Ended marriages render dashed with a hollow union ring | `d777756` |
| Multiple births, sibling adjacency | `e0e541c` |
| *(revert incidental repo-wide reformatting)* | `8e3a24d` |
| Custom fields | `f0d9821` |
| **Health view** — the data-quality validator | `98c438d` |
| *(fix: un-nest the ELK worker so the canvas renders)* | `8acbfa5` |

### What was added to the model

`Person`: `sex` (`male | female | other`; absent means unrecorded — there is deliberately no
`"unknown"` member, which would be a second way to say the same thing), `maidenName`, `nickname`,
`multipleBirthGroup` (a shared token so triplets work and the grouping survives a deletion),
`customFields` (label/value; blank label rejected).

`Relationship`: `subtype` (`biological | adopted | step | foster | guardian`; absent means
biological).

### The validator (`app/lib/analysis/validate.ts`)

Whole-pool, pure, `validate({people, relationships, memberships}) => Finding[]`.

**Errors:** death before birth · child born before parent · biological parent under 12 · child born
after a parent's death · marriage before a spouse's birth · marriage after a spouse's death.
**Warnings:** unresolved placeholder · belongs to no tree · missing birth year · implausible
lifespan (>120y).

Phase 1's `subtype` sharpens two rules: a **step-parent or guardian may legitimately be younger
than the child**, so those links are exempt from the ordering rules; and the nine-month posthumous
window applies **only to biological** links, because you cannot adopt, foster or become guardian to
a child born after you died — those get a *zero* window, i.e. a stricter rule, not a looser one.

### Bugs found and fixed along the way

- `updateRelationshipDates` rebuilds rather than patches, so it dropped `subtype` on every date edit.
- `DialogContent` had no max height, so the taller person form pushed its submit button off both
  ends of the centred dialog, unreachable and unscrollable. Now capped with its own scroll.
- `checkMarriage` would report on a relationship with a dangling endpoint, unlike `checkParentChild`.
- **The canvas never rendered at all.** Pre-existing on `master`. `use-elk-layout` spawned
  `elk-worker.ts` as a Worker, which then constructed ELK with a `workerUrl` — making elkjs spawn
  `elk-worker.min.js` as a *nested* worker, whose script fetch aborts with `net::ERR_ABORTED`. ELK
  is now constructed on the main thread as a lazy module singleton (heavy layout still runs in
  elkjs's own worker); the wrapper file is deleted.

---

## Phase 2 — Derived insight ✅

On `feat/v2-phase-2`. 5 commits, 469 tests passing.

| Feature | Commit |
|---|---|
| Insights view with family statistics | `71792dd` |
| Birthdays and anniversaries | `f5d796f` |
| `.ics` calendar export | `6e11d63` |
| Duplicate detector | `695ff26` |
| Merge two people | `fd12be1` |

### New modules

`app/lib/analysis/statistics.ts` · `app/lib/analysis/anniversaries.ts` ·
`app/lib/analysis/duplicates.ts` · `app/lib/export/ics.ts` · `app/lib/db/merge-people.ts` ·
`app/components/views/insights-view.tsx` · `app/components/people/merge-people-dialog.tsx`

### Judgement calls to preserve

- **Statistics exclude three things rather than guess:** negative lifespans (contradictory data —
  one bad record would drag the average down), marriages of unknowable length (no end date and no
  recorded death — most of these people are dead, so "to the present" invents a number), and
  half-siblings folded into a full-sibling group (grouping keys on the child's *full* parent set).
- **Anniversaries need a month and a day**, and reject approximate dates: "c. 3 May 1890" says the
  day is a guess. 29 February rolls to 1 March in non-leap years — deliberate, since an anniversary
  appearing one year in four serves nobody. Birthdays of people with a recorded death read "would
  have turned N".
- **`.ics` carries births and marriages only.** A recurring death-anniversary reminder is a
  different kind of thing and must not arrive in a calendar unasked. RFC 5545 details that are
  tested: CRLF endings, folding at 75 *octets* and never mid-character, `; , \` escaped, exclusive
  `DTEND`, stable UIDs from the person/relationship id.
- **The duplicate detector's disqualifiers matter more than its scoring.** Never flag a pair already
  related to each other (a same-named father and son is the single commonest false positive in
  genealogy data); a shared surname alone is never enough (half a tree shares one); birth years
  more than two years apart rule a pair out; a recorded sex mismatch rules it out. A weak given-name
  match is dropped even when everything else agrees — a list of weak guesses trains people to ignore
  the feature.
- **`mergePeople` runs in one transaction and refuses rather than guesses.** Duplicated links dedupe
  on type + direction + other person, keeping whichever copy knows more. A merge re-points a tree
  root (unlike `deletePerson`, which refuses). Memberships union, survivor's position override wins.

---

## Phase 3 — Canvas navigation & readability 🚧

**Why:** large trees become unreadable, and the canvas ships exactly one layout. Extends the
existing `appearance-store` and `hiddenGenerations` machinery rather than adding parallel systems.

| # | Feature | Notes |
|---|---|---|
| 3.1 | Ancestor / descendant focus modes | "Ancestors of X only", "descendants of X only", N generations up/down. Extends `app/lib/canvas/filter-generations.ts` and `hiddenGenerations` in `canvas-ui-store.ts`. Filter *after* layout so unfiltered nodes keep their positions. |
| 3.2 | Bloodline highlight | Select a person, glow the edge path back to the tree root. Pure graph walk over `deriveUnions` output. |
| 3.3 | Layout direction toggle | `elk.direction` `DOWN` / `RIGHT` in `run-layout.ts`. Separate from the radial work in `FUTURE-SCOPE §8`. Node handle positions must follow the direction. |
| 3.4 | Edge routing style picker | orthogonal / bezier / straight. Extends `AppearanceSettings`. |
| 3.5 | Node card templates | Choose what a card shows: photo on/off, dates on/off, compact initials-only for big trees. Slots into `AppearanceSettings`. |
| 3.6 | Colour by surname or root ancestor | Alternative to colour-by-generation; reuses the `generationColors` plumbing in `appearance-store.ts` / `appearance-resolve.ts`. |
| 3.7 | Theme toggle | No light/dark switch exists — only a `theme-color` meta tag in `index.html`. Also worth a high-contrast mode. |

**Watch out:** position overrides (`D9`) are layout-specific. Switching direction should either warn
that it clears overrides, or namespace them per layout mode.

---

## Phase 4 — Durability

**Why:** the real risk in this app. `SPEC.md §5.1` — IndexedDB is evictable, and two hours of data
entry can vanish silently.

| # | Feature | Notes |
|---|---|---|
| 4.1 | Local-folder auto-backup | File System Access API: `showDirectoryPicker`, persist the handle in IndexedDB, re-write the envelope on significant change. **Stays offline — local disk, not network.** Chromium-only, so manual export remains the fallback. This is the real answer to `§5.1`. |
| 4.2 | Rolling local snapshots | Last N compressed envelopes in IndexedDB (`fflate` already ships) with restore-to-point. Survives reloads, unlike an in-memory undo stack. |
| 4.3 | Backup staleness nudge | Last-export date is already tracked (`app/lib/db/app-meta.ts`). Quiet inline banner past ~30 days with unexported changes. Not a modal, not a nag. |
| 4.4 | Multi-tab safety | Two tabs on the same IndexedDB clobber each other's assumptions. At minimum detect via `BroadcastChannel` and warn. |
| 4.5 | Storage breakdown | `navigator.storage.estimate()` is unused — `app/lib/storage.ts` only wraps `persist`/`persisted`. Show quota vs usage, largest photos, a re-compress action. Serves `§5.2`'s "make the risk legible". |

---

## Phase 5 — Fast entry

**Why:** `SPEC.md §3.1` expects 30+ people added in one sitting; the current loop doesn't support
that pace.

| # | Feature |
|---|---|
| 5.1 | Keyboard-driven canvas: arrows step between relatives (up = parent, down = child, left/right = sibling/spouse), Enter to edit, P/S/C to add |
| 5.2 | Drag-to-connect relationships from a node handle |
| 5.3 | "Add whole family" form — spouse + N children in one submit |
| 5.4 | Inline editing in the People table (currently a dialog per edit) |
| 5.5 | Canvas multi-select → bulk add/remove from tree, align |
| 5.6 | CSV import/export — families collect this data in spreadsheets; trivial to parse, no dependency |
| 5.7 | Markdown notes with `[[Person Name]]` links resolving to nodes |

*5.3 is the natural place to also expose the parent-child `subtype` picker in the add-relative form
for siblings, which Phase 1 deliberately left to parent/child adds only.*

---

## Phase 6 — Media & output

| # | Feature | Notes |
|---|---|---|
| 6.1 | Multiple photos per person | `Photo` is already its own table; `Person.photoId` → an ordered `photoIds` array is a contained change |
| 6.2 | Document / scan attachments | PDF and image blobs, stored like photos |
| 6.3 | Photo wall view | A grid of everyone with a photo — third view alongside canvas and table |
| 6.4 | Family-book PDF + print stylesheet | One page **per person** with photo, dates, notes, parent/child lists. Deliberately sidesteps `FUTURE-SCOPE §7`'s canvas-tiling problem, and is what people actually hand to relatives |
| 6.5 | Living-person privacy redaction on export | Redact details for anyone without a death date in PNG/PDF/GEDCOM. Standard in genealogy tools, and matters because these files get emailed around |

---

## Phase 7 — Polish & reach

| # | Feature | Notes |
|---|---|---|
| 7.1 | Demo / sample tree | Bundled fixture to explore before entering real data; doubles as a test fixture |
| 7.2 | Bundled offline help | "Fully offline" means you can't link out to a wiki when someone's stuck |
| 7.3 | Canvas accessibility pass | ARIA roles on nodes, focus order, and a screen-reader-friendly nested-list rendering of the tree |

---

## 4. Still deferred to `FUTURE-SCOPE.md`

Not part of this programme, and each needs its own planning pass:

- **Sources, citations, life events, places** (`§4`) — the big data-model expansion. `customFields`
  from Phase 1 is the deliberate stopgap.
- **GEDCOM import** (`§3`) and **JSON-import merge/dedup** (`§9`) — both can now reuse
  `mergePeople` and `findDuplicates` from Phase 2, which is the tractable starting point `§9`
  asked for.
- **Relationship path finder** (`§5`), **timeline view** (`§6`), **multi-page PDF tiling** (`§7`),
  **radial layouts** (`§8`).
- **Cloud sync** (`§1`) and **accounts** (`§2`) — excluded by the offline constraint above.
