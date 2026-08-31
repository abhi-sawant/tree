# Family Tree v2 — Phase Programme

**Purpose:** a self-contained handoff document. Anyone (or any new session) picking up this work
should be able to read only this file plus `SPEC.md` and continue without re-deriving anything.

**Status:** Phases 1–4 complete. Phase 5 (Fast entry) is next.

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
  is currently at `version(5)`: `version(3)` added the `sex` index, and Phase 4 added two *new
  stores* — `snapshots` (v4) and `backupTargets` (v5) — which do need a bump, unlike a new field.
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
| 3 | Canvas navigation & readability | 7 | ✅ Complete on `feat/v2-phase-3` |
| 4 | Durability | 5 | ✅ Complete on `feat/v2-phase-4` |
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

## Phase 3 — Canvas navigation & readability ✅

On `feat/v2-phase-3`. 7 commits, 534 tests passing.

| Feature | Commit |
|---|---|
| Focus on a person's ancestors / descendants | `2cb3343` |
| Bloodline highlight to the tree root | `924c93d` |
| Layout direction (top-to-bottom / left-to-right) | `1e9b6c6` |
| Connector shape picker | `bf5c64e` |
| Choose what each card shows | `35288ea` |
| Colour cards by surname or branch | `8797981` |
| Light/dark theme toggle | `5f7bf6b` |

### New modules

`app/lib/canvas/focus-scope.ts` · `app/lib/canvas/bloodline.ts` ·
`app/lib/canvas/layout-direction.ts` · `app/lib/canvas/edge-routing.ts` ·
`app/lib/canvas/color-groups.ts` · `app/lib/ui/theme-store.ts`

### Judgement calls to preserve

- **Focus filters *before* layout; hidden generations filter *after*.** That asymmetry is
  deliberate: toggling a generation off and on again must not reshuffle the tree, while a focus
  view is meant to be compact rather than the full tree with holes in it. `toElkGraph` already
  scopes off membership, so focus just narrows the member list.
- **Focus pulls in spouses but never traverses through them.** Without them a couple is split and
  the union node between them is stranded, since `deriveUnions` needs both parents present to
  produce one. Traversing through a spouse would drag in their whole separate family.
- **Handles are named by role, not by side** — `in`, `children`, `cross-start`, `cross-end`. This
  is what makes the direction toggle tractable: switching direction moves where a handle sits
  without renaming it. A test asserts the ids carry no side name.
- **Everything else about direction reduces to one idea:** generations advance along the main
  axis, siblings and spouses spread along the cross axis. `unionPosition` needs no branch at all —
  the midpoint of the couple's two centres is the true midpoint on the cross axis and collapses to
  the row/column centre on the main axis.
- **Position overrides are not cleared on a direction change.** They are layout-specific, so the
  panel warns rather than silently discarding hand-placed cards.
- **Bloodline never traverses a marriage** (not a step in a line of descent) and highlights an edge
  only when *both* ends are on the line — which is what keeps the off-line parent's half of a
  shared marriage line plain. Its colour is deliberately not customisable.
- **`PersonNodeData.colorIndex` is separate from `generation`.** They were the same number until
  colour grouping existed, but they answer different questions — `generation` still drives the
  generation filter, and conflating them would make the filter follow the colour scheme.
- **"Branch" means which of the root person's children a person descends from.** Well defined,
  unlike "their root ancestor": with two parents everyone has two lineages, so any single answer
  there is an arbitrary pick presented as meaning.
- **The theme is applied by an inline script in `index.html` before first paint.** Without it,
  dark-mode users get a white flash on every load. That makes the localStorage key a contract
  between a `.ts` file and an `.html` file with nothing linking them, so a test reads `index.html`
  and asserts it — verified by breaking the key and watching the test fail.

### Verified live

Built a three-person family, exercised every feature, then deleted it. Confirmed: descendants-only
focus from a childless person leaves just them, laid out compactly at the origin; the bloodline
glows the path Arjun → union → root with **only** the root's half of the marriage line highlighted
and the other parent's half left plain; left-to-right stacks the couple vertically with the union
between them and the child flowing right; straight routing and name-only cards both apply; surname
colouring puts both Sawants on `--level-0` and Iyer on `--level-1`; dark theme survives a reload
with no flash.

### Deferred from this phase

**High-contrast mode.** It needs a third palette of real colour choices, and inventing values here
would mean guessing at what ought to be designed. Left undone rather than half-done.

## Phase 4 — Durability ✅

On `feat/v2-phase-4`. 5 commits, 703 tests passing.

**Why:** the real risk in this app. `SPEC.md §5.1` — IndexedDB is evictable, and two hours of data
entry can vanish silently.

| # | Feature | Commit |
|---|---|---|
| 4.5 | Storage breakdown | `d629586` |
| 4.2 | Rolling local snapshots | `7852134` |
| 4.1 | Local-folder auto-backup | `0bc2b7e` |
| 4.3 | Backup staleness nudge | `7ae7dcc` |
| 4.4 | Multi-tab safety | `1ec8306` |

Built in dependency order rather than numbered order: 4.5 is self-contained, 4.2 introduces the
change signal that 4.1 and 4.3 both consume, and 4.4 gates 4.1 and 4.2 once they exist.

### New modules

`app/lib/storage-breakdown.ts` · `app/lib/relative-time.ts` · `app/lib/db/photo-sizes.ts` ·
`app/lib/db/change-signal.ts` · `app/lib/db/tab-presence.ts` · `app/lib/db/use-tab-presence.ts` ·
`app/lib/db/use-change-stamp.ts` · `app/lib/backup/schedule.ts` · `app/lib/backup/snapshots.ts` ·
`app/lib/backup/file-system-access.ts` · `app/lib/backup/folder-backup.ts` ·
`app/lib/backup/staleness.ts` · `app/lib/backup/use-auto-snapshots.ts` ·
`app/lib/backup/use-folder-backup.ts` · `app/lib/backup/use-backup-nudge.ts` ·
`app/components/views/storage-panel.tsx` · `app/components/views/snapshots-panel.tsx` ·
`app/components/views/backup-folder-panel.tsx` · `app/components/shell/backup-nudge.tsx` ·
`app/components/shell/tab-notice.tsx`

### The change signal — read this before adding anything change-driven

`app/lib/db/change-signal.ts` sits in **Dexie's DBCore middleware**, installed in `db.ts`, not in the
`lib/db/*` helpers. The convention says every mutation goes through those helpers, but "meant to" is
not a guarantee and a durability feature that misses writes is worse than none — a test proves the
middleware catches a stray `db.people.put` from outside the helpers.

Three properties any new consumer must respect:

1. **It fires per low-level operation, not per transaction.** One bulk write is dozens of signals.
   Always debounce through `createChangeScheduler`; never do work directly in a listener.
2. **It fires before the transaction commits.** An aborted transaction can signal a change that never
   landed. That asymmetry is the safe one — a spurious signal costs redundant work, a missed one
   costs the change — but a consumer must be idempotent.
3. **Writes to `BOOKKEEPING_TABLES` (`appMeta`, `snapshots`, `backupTargets`) are excluded.** Anything
   new that records facts *about* the data rather than the data itself belongs on that list, or it
   will feed itself in a loop.

A throwing listener is swallowed on purpose: letting it propagate would reject the write it was
notified about, turning a broken banner into lost data.

### Judgement calls to preserve

- **Snapshots exclude photos; the folder backup includes them.** They answer different questions. A
  snapshot guards against a wrong merge or a mistaken delete, where photos are nearly all of the
  bytes and nearly none of the risk — ten copies of every photo would multiply storage use by ten in
  the one place `§5.1` names as the danger. Photo-less, a snapshot of a large tree DEFLATEs to a few
  kilobytes (461 B for two people, live). The folder backup is a real backup and carries everything.
- **The consequence is stated rather than hidden:** `deletePerson` deletes the person's photo too, so
  a snapshot restore brings them back without their picture. `applyBackup(parsed, {photos: "keep"})`
  clears the dangling `photoId` instead of leaving the database inconsistent.
- **`applyBackup` is the single definition of "replace everything",** extracted from `importBackup`
  and shared with `restoreSnapshot`, so a file import and a rollback cannot drift apart.
- **"Newest N" alone is not a retention policy.** Auto-snapshots firing per edit would put all ten
  inside the last minute, with the state from before the damage already pruned.
  `MIN_AUTO_INTERVAL_MS` (10 min) is what makes ten of them span the two-hour session `§5.1`
  describes. An empty pool is never snapshotted — the first person added would otherwise burn a slot
  on restoring the app to empty.
- **A restore is itself undoable.** `restoreSnapshot` parses the archive *before* taking its
  pre-restore snapshot, so a damaged one fails without disturbing retention.
- **The folder backup writes one file per calendar day and never deletes.** A fixed filename leaves
  no history; rotating with `removeEntry` would mean this app deleting files out of a folder the
  user owns, where a month-old backup is worth more than a tidy directory. `createWritable` renames
  on close, so a crash mid-write leaves yesterday's archive intact rather than a truncated file that
  looks like a backup and isn't.
- **Folder permission cannot be re-acquired silently.** A stored handle comes back at `"prompt"`
  after a browser restart and `requestPermission` needs a user gesture, so `getFolderStatus` only
  ever *queries* and reconnecting is a button. A failed write is recorded on the target row: a
  folder on an unplugged drive fails every time, and a silent no-op is indistinguishable from a
  working backup — the worst failure mode this feature could have.
- **A successful folder write sets `lastExportDate`,** because the bytes that landed are the same
  envelope a manual export produces. 4.3 depends on that being true.
- **The staleness nudge needs a stamped change date, not a derived one.** `max(Person.updatedAt)` is
  wrong twice: `Relationship` has no timestamps, so marrying two existing people is invisible; and
  deleting the most recently edited person moves the maximum *backwards*, making a destructive change
  look freshly backed up. `useChangeStamp` writes `lastChangeDate` off the change signal instead.
- **The nudge stays quiet whenever the data is ambiguous.** A clock that moved backwards, or an
  export with no recorded change date, both read as "not stale". Silence is the right way to be
  wrong about a nudge — this is the Phase 1 validator rule ("never assert what the data doesn't
  settle") applied to a banner. Dismissal holds 7 days and is cleared outright by an export.
- **Multi-tab distinguishes two very different situations.** A second tab is not a problem —
  liveQuery keeps both in step — so it gets a quiet grey line. A *restore* in another tab is a
  problem: the other tab's next edit would write dead records back over the restored ones, so that
  gets a destructive-coloured banner which **latches** and demands a reload.
- **Presence is a heartbeat with expiry, not register/deregister.** A force-quit tab never says
  goodbye, and a peer that lingered for ever would stop the survivor from ever becoming leader —
  the safety net would switch itself off after a crash, exactly when it is needed. `pagehide`'s
  farewell is an optimisation nothing depends on.
- **Leader election is lowest-id-wins after a join grace.** Any total order works; what matters is
  that every tab computes the same answer from the same set with no negotiation. A browser without
  `BroadcastChannel` degrades to permanent leadership, so backups still run rather than being
  disabled by a missing detection mechanism.
- **The storage panel reports two numbers and refuses to reconcile them.** `estimate()` covers the
  whole origin and is padded on purpose; the photo total is measured exactly. Presenting either as
  "the size of your family data" would be a precise-looking lie. Orphaned photos are *reported*, not
  swept up — deleting a blob whose owner might still be recoverable is not this feature's call.
- **Re-compression refuses to spend quality for nothing.** Uploads have been capped at 800px/q0.8
  since Phase 0, so `shouldKeepRecompressed` keeps the original below a 5% saving, and a photo that
  fails to decode is left exactly as it was. The batch is sequential: thirty concurrent bitmap
  decodes is how a phone browser tab gets killed, which is the data loss this phase exists to stop.
- **No off switch on snapshots.** An option to disable the app's own safety net is one people turn
  off and regret, and at kilobytes per snapshot there is nothing to save by it. The total is shown
  and individual snapshots can be deleted.
- **The nudge banner uses `--primary`, not a warning colour.** There is no warning token in the
  palette, and Phase 3 already declined to invent colour values rather than guess at what ought to
  be designed. It isn't an error anyway.

### Testing note

`vitest.setup.ts`'s `structuredClone` shim needed one narrow extension. Browsers clone a
`FileSystemDirectoryHandle` natively; Node has no notion of it, and any test double is made of
functions, which never clone. Rather than pass all functions through — which would hide real
`DataCloneError`s — a test tags one object with the `OPAQUE_CLONE` marker and it rides the same
by-reference path the Blobs already do. A test asserts that round trip, so a drift in the contract
fails with a clear message instead of an opaque error in twenty places.

### Verified live

Exercised end to end against a real tree in Chromium, then restored the browser profile to its
starting state. Confirmed: the storage panel reads 38 KB of 2.7 GB with the one photo attributed to
its owner; a manual snapshot of two people is 461 B against an 8 KB photo library; an edit made 39
seconds after a snapshot correctly produces **no** auto-snapshot, the 10-minute floor holding; a
rollback removes a person added after the snapshot, writes a `pre-restore` point automatically, and
leaves the photo table untouched with a still-valid `photoId`; restoring *that* brings the person
back, so the undo is genuinely bidirectional; a second tab makes both show "Also open in another
tab"; a restore in one tab replaces that line in the other with the red "everything here is out of
date" banner; and a backdated export date produces "Your last backup was 60 days ago", which
`Later` dismisses and persists.

### Deferred from this phase

**Nothing.** All five features shipped. The one thing deliberately *not* built is an option to turn
snapshots off — see the judgement call above.

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
