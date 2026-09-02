# Family Tree v2 — Phase Programme

**Purpose:** a self-contained handoff document. Anyone (or any new session) picking up this work
should be able to read only this file plus `SPEC.md` and continue without re-deriving anything.

**Status:** Phases 1–7 complete. The programme is finished; what remains is in §4.

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
| 5 | Fast entry | 7 | ✅ Complete on `feat/v2-phase-5` |
| 6 | Media & output | 5 | ✅ Complete on `feat/v2-phase-6` |
| 7 | Polish & reach | 3 | ✅ Complete on `feat/v2-phase-7` |

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

## Phase 5 — Fast entry ✅

On `feat/v2-phase-5`. 8 commits, 863 tests passing.

**Why:** `SPEC.md §3.1` expects 30+ people added in one sitting; the previous loop didn't support
that pace.

| # | Feature | Commit |
|---|---|---|
| 5.1 | Keyboard-driven canvas | `ea6cf1f` |
| 5.2 | Drag-to-connect from a node handle | `78252a9` |
| 5.3 | "Add whole family" — spouse + N children in one submit | `73690dc` |
| 5.5 | Canvas multi-select → bulk add/remove from tree, align | `ca930da` |
| 5.4 | Inline editing in the People table | `f1a2957` |
| 5.6 | CSV import/export | `b2084a3` |
| 5.7 | Markdown notes with `[[Person Name]]` links | `f2fd884` |
| *(chore: `autoPort` so a second session can run a dev server)* | | `3dbb426` |

Built 5.5 before 5.4 so the selection model was settled before the table work; the rest in order.

### New modules

`app/lib/canvas/keyboard-navigation.ts` · `app/lib/canvas/use-canvas-keyboard.ts` ·
`app/lib/canvas/connect-intent.ts` · `app/lib/canvas/align.ts` · `app/lib/db/add-family.ts` ·
`app/lib/people/inline-edit.ts` · `app/lib/people/name-index.ts` · `app/lib/export/csv.ts` ·
`app/lib/export/people-csv.ts` · `app/lib/db/import-people-csv.ts` · `app/lib/notes/markdown.ts` ·
`app/components/canvas/add-family-form.tsx` · `app/components/canvas/multi-select-panel.tsx` ·
`app/components/people/editable-cell.tsx` · `app/components/people/notes-view.tsx`

### What changed in the shared layers

- **`orderFamilyGraph` now exports its ordering rule** as `recordOrderComparator` / `sortSiblingIds`.
  Keyboard navigation along a sibling row has to agree with the order the cards are drawn in, and a
  second comparator would drift.
- **`personDisplayName` now exports its parts** as `personNameSegments`. The People table lays given,
  nickname and family out separately so the first and last can be edited in place; without this it
  would have been a second place assembling a name, against the Phase 2 rule. A test asserts the
  segments rejoin to exactly what `personDisplayName` produces.
- **`createPerson` takes an optional `createdAt`.** `orderFamilyGraph` sorts a sibling row by
  `createdAt` and breaks ties on the random UUID, so a batch created inside one millisecond would
  lay out in an arbitrary order. `addFamily` stamps children one apart.
- **`NameIndex` (`app/lib/people/name-index.ts`) is the one place a written name resolves to a
  person**, shared by the CSV importer and by `[[wiki links]]`. Two implementations would drift into
  disagreeing about nicknames or case — visible as a link that works in a spreadsheet and not in a
  note.
- **The canvas store holds `selectedNodeIds`, not `selectedNodeId`.** `selectedNodeIdOf` /
  `useSelectedNodeId` answer only when exactly one node is selected; everything that describes or
  acts on "the" selection goes through them.

### Judgement calls to preserve

- **Arrow keys follow the layout, not a fixed "up is parent".** `arrowKeyToStep` rotates the four
  arrows with the layout direction, because in a left-to-right tree the parents genuinely are drawn
  to the left. An arrow pointing somewhere other than where the card sits is worse than no binding.
- **A cross-axis row is anchored on a canonical person, not on whoever is navigating.** Anchoring on
  the navigator made ← and → stop being inverses — a childless couple ping-ponged, each seeing the
  other as "my spouse, one to the right". Someone with recorded parents anchors their own row;
  someone without is a married-in spouse and belongs in their partner's. No wraparound at the ends:
  holding → must stop at the edge of a family rather than snapping back to the far side.
- **`P`/`S`/`C` are bound; sibling deliberately is not.** `ensureParentsForSibling` invents a
  placeholder parent when none is recorded, and a bare unmodified keystroke should not be able to
  conjure a person nobody asked for. Every binding is guarded by `isTypingTarget`, or typing
  "Pieter" into a field would fire add-parent on its first letter.
- **Drag-to-connect splits its check in two.** `connectionShape` answers geometrically and is the
  only half wired to `isValidConnection`, so a drag naming a real relationship always lands and is
  then explained if it can't be recorded. Gating the drop on the data instead leaves a connector
  that refuses to land with no reason given — indistinguishable from a broken canvas. It refuses a
  pair already related (the app stores at most one link per pair, so a repeat drag is a mis-drop),
  a third parent, a cycle, and a self-link. Union dots stay non-connectable: their child link is
  already one click away, and a drag writing two parent rows at once is a bigger action than it
  looks.
- **`addFamily` doesn't re-marry a couple who are already married.** That is the commonest reason to
  open the form — "these two had these children" — and there is no representation for a pair married
  twice. The child rows carry fewer fields than the person form on purpose: a name, a year, sex and
  how the link came about is what somebody reading a family off a document has to hand.
- **Align has two modes, not a drawing tool's six**, and snaps to the topmost/leftmost rather than
  the average, so the card defining the line doesn't move and the result is predictable before you
  click. Aligning writes position overrides — a row the next layout could reshuffle wasn't aligned.
  Bulk remove skips the tree's root and *says so*, or the count silently disagrees with the
  selection.
- **The multi-select bar is a strip above the canvas, not a floating panel.** The tree toolbar spans
  nearly the full width at the top and the legend and zoom controls hold the bottom corners; every
  floating position collided with something, and a reserved row can never cover a card.
- **An inline date cell edits its year** and carries the month, day and approximate flag through —
  editing "c. 3 May 1890" must not drop the day or make a circa date exact. Emptying it clears the
  whole date: a `PartialDate` with no year renders empty and reads as unknown everywhere, so a
  stranded month would be invisible until a later year brought it back.
- **CSV is the spreadsheet view, not an interchange format.** It carries names, sex, dates, notes and
  the parent/spouse structure by *name* — nobody types a UUID into a spreadsheet. It does not carry
  photos, custom fields, marriage dates or link subtypes, which is safe only because import is
  additive and never rewrites an existing link: the fields CSV can't see, it can't damage. Unlike
  `importBackup`, which replaces everything, a spreadsheet is a fragment of a database rather than
  the whole of one. A reference matching nobody and one matching several people get different
  messages — one is a typo, the other a disambiguation only the reader can make — and every refusal
  is reported beside the counts, because a count of successes alone is how a mistyped parent name
  disappears unnoticed.
- **The notes parser produces data, never an HTML string.** The renderer walks it and builds React
  elements, so there is no `dangerouslySetInnerHTML` anywhere and `<script>alert(1)</script>` in a
  note is text. The subset stops at headings, lists, bold, italic and code: every construct added is
  one more thing that can surprise someone who only wanted to type an asterisk. Links resolve at
  render time against the live pool, so a note doesn't go stale when someone is renamed or merged
  away; an unresolvable one is drawn dotted and inert rather than hidden.
- **The phase note's extra ask is done:** the parent-child `subtype` picker is now offered on sibling
  adds, describing the new sibling's own link to the shared parents.

### Bugs found and fixed along the way

- **Deduping CSV links in both directions** made "B is A's parent" look like a duplicate of "A is B's
  parent" and skipped it silently, when it is really a contradiction `addRelationship` refuses as a
  cycle. Parent links now dedupe by direction; marriages, which have none, dedupe on the sorted pair.
  Caught by its own test.
- **The first inline-editor kept its input mounted**, so it had to reset the draft in an effect and
  focus on the next animation frame — keystrokes landing in that gap went nowhere, and a typed name
  was silently discarded. Caught in the browser, not by a test. The editor is now mounted only while
  editing, seeding its draft once and taking focus synchronously.

### Verified live

Built a seven-person family in Chromium and exercised every feature, then cleared the profile.
Confirmed: `S` opens the add-spouse form and typing "Arjun P" into a field does **not** fire the
add-parent shortcut; ← and → walk between a couple and `Enter` puts the cursor in the name field
with the text selected; dragging a child handle onto an unrelated person's parent handle records the
link and takes the tree from one generation to two, and repeating it the other way round is refused
with "Those two are already recorded as related"; "Add whole family" on an already-married couple
reports "2 people added", writes no second marriage row and lays the children out in entry order;
shift-clicking three cards shows the bar, Align tops snaps two of them to the third without moving
it and survives a reload, and removing a selection containing the root leaves the root in place;
inline editing saves a family name and a birth year (the row re-sorting by the new date), refuses
"19th century" with a message while keeping the cell open, and abandons on Escape; exporting five
people yields readable parent and spouse columns, and importing a four-row sheet adds three people
and three links, puts a new couple and their child on the canvas as a third generation, and reports
both the nameless row and the unresolvable parent; a note with a heading, bold, italic, a list and
four links renders as prose, `[[Anil Sawant]]` selects him, `[[Nobody Real]]` is dotted and inert,
and `<script>alert(1)</script>` appears as literal text.

### Deferred from this phase

- **`[[` autocomplete while typing a note.** The links work and unresolved ones say so, but you have
  to know the name. A picker inside a textarea is its own piece of design work.
- **Box-select on the canvas.** Shift-click covers the bulk cases; a drag-rectangle needs React
  Flow's `elementsSelectable`, which would put a second selection model alongside the store's.

---

## Phase 6 — Media & output ✅

On `feat/v2-phase-6`. 6 commits, 993 tests passing.

| # | Feature | Commit |
|---|---|---|
| 6.1 | Multiple photos per person | `0502197` |
| 6.2 | Document / scan attachments | `0c04c91` |
| 6.3 | Photo wall view | `7496c06` |
| 6.4 | Family-book PDF + print stylesheet | `e0556bb` |
| 6.5 | Living-person privacy redaction on export | `278c75c` |
| *(fix: four things the browser found that the tests didn't)* | | `a62c859` |

Built in numbered order: 6.1 changes the photo model everything else reads, 6.2 adds the parallel
table, and 6.3–6.5 consume both.

### New modules

`app/lib/person-photos.ts` · `app/lib/attachments.ts` · `app/lib/db/attachments.ts` ·
`app/lib/people/photo-wall.ts` · `app/lib/export/family-book.ts` ·
`app/lib/export/family-book-pdf.ts` · `app/lib/export/family-book-export.ts` ·
`app/lib/export/redaction.ts` · `app/lib/export/use-redaction.ts` · `app/lib/ui/privacy-store.ts` ·
`app/components/people/person-photos-panel.tsx` ·
`app/components/people/person-attachments-panel.tsx` · `app/components/views/photo-wall-view.tsx`

### What changed in the shared layers

- **`Person.photoIds` is the ordered list and the source of truth; `photoId` is a mirror of
  `photoIds[0]`.** Keeping the scalar is deliberate: data already in a browser, and backups already
  in people's hands, carry only that field, and an older build importing a new backup would
  otherwise show every face as the default avatar. `app/lib/person-photos.ts` owns the rule, and
  `photoFieldsFor` is the single place both fields are written, so the mirror cannot drift.
- **Dexie is at `version(6)`** — `attachments` is a new *store*, so unlike `photoIds` it needed a
  bump. Indexed on `personId`, the only question anything asks of it.
- **`applyBackup` takes `attachments` separately from `photos`,** defaulting to whatever `photos`
  says, so no existing caller changed.
- **`buildStorageBreakdown` reports documents as their own total and own list.** Merging them with
  photos would produce a "largest files" list that is all documents — they are uncapped where photos
  are capped at 800px.
- **`notesToPlainText` was added beside `parseNotes`,** so the flattener the book uses and the
  renderer the screen uses cannot disagree about what a note says.
- **`mergePeople` returns `adoptedPhotos: number` (was `adoptedPhoto: boolean`) and
  `movedAttachments: number`.** It no longer deletes anything.

### Judgement calls to preserve

- **An empty `photoIds` array is an answer, not an absence.** `personPhotoIds` returns `[]` rather
  than falling through to the legacy scalar; getting this wrong makes removing a person's last photo
  silently undo itself on the next read. Clearing writes `undefined` to both fields, so a person with
  no photos looks on disk exactly as they always have.
- **The person form speaks for the cover; the gallery lives in the detail panel.** The form shows one
  avatar, so "Change photo" can only honestly mean the cover — it replaces just that and says how
  many others it isn't touching. The gallery writes immediately rather than staging against a Save:
  the person already exists, and a reorder that only landed on submit is a surprising way to lose one.
- **A merge no longer destroys a photo.** Both records describe the same person, so both sets of
  pictures are of them; the loser's are appended after the winner's. Previously the loser's was
  deleted outright — an unrecoverable loss on a path the user thought was a tidy-up. A photo both
  records shared is skipped without being deleted: it is one row, not two.
- **GEDCOM emits one OBJE per photo.** A person's first photo keeps the bare `media/I1.jpg` path it
  has always had, so a tree with one photo each exports exactly as before. The numbering counts
  photos that actually resolved, not list positions, or a missing blob would make two exports of the
  same tree disagree about a filename.
- **Documents are their own table, not a `Photo` variant.** A photo is downscaled to 800px on upload
  and a document must not be — the point of a scan is that the small print stays readable. A photo is
  a face the app draws; a document is a file it only ever hands back, byte-identical.
- **The attachment type list is closed and there is a size cap, both stated.** PDFs and images only,
  25 MB a file, because everything here is stored verbatim in the quota `§5.1` calls the app's
  biggest risk. `attachmentProblem` returns a sentence, not a code — every caller shows it verbatim —
  and names the file and its actual size. Dropping five files reports all five refusals.
- **A blank reported MIME type is guessed from the extension, not refused,** and the *resolved* type
  is what gets stored: a file the browser typed `""` would otherwise come back out of a backup as an
  unopenable blob.
- **Nothing goes into the GEDCOM from the documents table.** 5.5.1's MULTIMEDIA_FORMAT enumeration
  has no PDF, and importers drop an OBJE they can't classify — so a document exported there would
  usually vanish while appearing to have been included. Settings says so.
- **Snapshots exclude documents for the photo reason, only more so.** Stored at full size, they are
  an even larger share of the bytes and an even smaller share of the risk.
- **The photo wall shows only people with a face, and says how many it left out.** "34 of 112 people
  have a photo" is the number that shows where the gaps are; a wall of identical default avatars says
  nothing about who is missing and buries the 34 that matter. One face per person, with a "+3"
  corner, or one well-photographed grandmother crowds out three other people. Chronological by
  default so the wall reads as generations — `comparePartialDate` is right here *because* this is a
  sort and not a claim about who was born first.
- **The wall's scope is the user's choice**, unlike a validator finding or a statistic. Both readings
  of "the family" are reasonable for browsing.
- **The family-book renderer owns page numbers, not the content model.** A page can spill onto a
  second sheet — a long note, thirty children — which shifts everything after it. Person pages are
  laid out first, the title and contents are inserted in front once the real numbers are known, and
  footers are written in one pass over what was produced. Nobody is truncated at the bottom margin.
- **The book is scoped to the open tree, unlike every other file export.** `D14` scopes exports
  pool-wide because they are *copies of the data*; this is a document about one family, so the
  argument that scopes statistics to the open tree applies instead.
- **A relative with no page in the book is still named** ("Not in this book"), or a page would claim
  someone had one parent when the record says two. Pages carrying only a name are counted on the
  title page.
- **Redaction inverts the Phase 1 validator rule.** A finding must never fire on an undecidable
  comparison; here everything undecidable resolves to *redact*, including someone with no dates at
  all. Wrongly hiding a dead person's dates costs a reader one lookup; wrongly publishing a living
  person's costs them something they cannot take back. The count is stated beside the switch and on
  the book's title page so the aggressiveness is visible rather than surprising.
- **A death needs a year to count as one**, since a `PartialDate` with no year reads as unknown
  everywhere else — otherwise a stray keystroke could unredact somebody. The century cut-off uses
  `definitelyBefore`, so "c. 1923" stays withheld while "1920" does not.
- **The surname survives redaction; the given name becomes "Living".** Hiding it would leave a chart
  of twenty identical cards nobody can read, and protects almost nothing in a document that is a
  family tree. Sex survives because it orders HUSB/WIFE in a FAM, and a redacted export that
  reshuffled spouses would be *wrong* rather than merely quiet. Relationship dates go whenever either
  end is redacted — a hidden birth date beside a visible wedding date is the same information
  arriving a different way.
- **The canvas redacts what it draws, not what it exports.** PNG and PDF capture the live viewport,
  so this is where it has to happen — and the user then sees exactly what will leave rather than
  trusting a hidden transform. The detail panel keeps the real records; that is the user's own data.
- **The backup is exempt from redaction, and says so.** It is the user's own complete copy and the
  thing `§5.1` exists to encourage; redacting it would turn the safety net into a data-loss mechanism.
- **The privacy setting persists,** and lives in its own store rather than beside card widths. The
  risk is asymmetric: someone who turned it on and found it off next session would publish what they
  meant to withhold.
- **The print stylesheet opts chrome out by `data-print="hide"`,** not a Tailwind variant per
  element, so the whole rule set is legible in one place — and so the rules with no variant (page
  margins, unwinding the full-height flex shell and its scrollers, forcing the light palette for the
  reason `EXPORT_BACKGROUND_COLOR` exists) sit beside the ones that have one. Popups are matched by
  ARIA role because they are portalled outside that tree.

### Bugs found and fixed along the way

All four were found in the browser, not by a test — see `a62c859`.

- **jsPDF drops characters its WinAnsi fonts can't encode, silently.** "1915–1990" reached the page
  as "19151990", one meaningless number, and bulleted notes lost their bullets. `toPdfText` maps them
  at the single point where text reaches the page. It belongs in the renderer, not the content model:
  an en dash is the correct thing for a lifespan to *contain*.
- **An open dropdown printed as a grey slab over the content**, because popups portal to the end of
  `<body>` where no `data-print` attribute can reach them.
- **A document filename truncated to about eight characters** in the 340px panel — "Birth ce…"
  identifies nothing, which is the one job the name has.
- **`Select` wraps itself in a `w-full` container**, so a width set on the control does nothing.

### Verified live

Built a four-person family in Chromium and exercised every feature, then cleared the profile.
Confirmed: the `version(6)` upgrade creates the attachments store on an existing database; two photos
on one person show as cover + "Photo 2", and "Make cover" repaints both the card and the panel
header; the storage panel attributes both of Anil's photos to him and lists the two documents under
their own heading with their owners; the photo wall reads "2 of 4 people have a photo", orders 1910
before 1915, badges the extra photo "+1" and explains the two it left out; the exported book is six
pages — title, contents, four people — with contents entries 3–6 matching the footers, photos
embedded, the note flattened to "Worked the mills. See Priya Iyer." and "Birth certificate.pdf"
listed; with redaction on the canvas immediately shows both undated people as "Living Sawant", the
title page says "2 people who may still be living have had their details withheld", the GEDCOM writes
`1 NAME Living /Sawant/` with no dates or notes while both dead spouses keep theirs including the
1938 `MARR` date, and the redacted person's document is not listed; the setting survives a reload;
a real backup .zip carries all three photos, both attachments and `backup.json`; and forcing the
print rules on gives a full-width People table with no chrome, no controls and no action column.

### Deferred from this phase

- **An embedded font for the family book.** jsPDF's standard fonts are WinAnsi, so a name in a
  non-Latin script cannot be drawn at all — `toPdfText` only rescues the Latin-1-adjacent characters.
  Fixing it properly means shipping a Unicode font, which would add megabytes to a bundle that has to
  work offline, and choosing which scripts to cover. Its own piece of work.
- **A viewer for attachments.** Every browser already has a better PDF and image viewer than this app
  could build, and the file handed back is byte-identical to the one added.

---

## Phase 7 — Polish & reach ✅

On `feat/v2-phase-7`. 3 commits, 1067 tests passing.

| # | Feature | Commit |
|---|---|---|
| 7.1 | Demo / sample tree | `d78ef59` |
| 7.2 | Bundled offline help | `b4d0561` |
| 7.3 | Canvas accessibility pass | `326b82a` |

Built in numbered order: 7.1 produces the fixture 7.3's tests are written against, and 7.2
documents both.

### New modules

`app/lib/demo/sample-tree.ts` · `app/lib/demo/load-sample-tree.ts` ·
`app/lib/help/help-content.ts` · `app/lib/help/use-help-shortcut.ts` ·
`app/lib/canvas/aria-labels.ts` · `app/lib/canvas/tree-outline.ts` ·
`app/components/markdown/markdown-view.tsx` · `app/components/views/sample-tree-panel.tsx` ·
`app/components/views/help-view.tsx` · `app/components/canvas/tree-outline-panel.tsx`

### What changed in the shared layers

- **The notes renderer is now `MarkdownView`,** shared by a person's notes and the help pages.
  `notes-view.tsx` reduces to supplying the one thing specific to a note: what `[[a name in
  brackets]]` means. Two walkers over the same parse tree would be two chances to forget a node
  kind, and the property that nothing here needs `dangerouslySetInnerHTML` is a property of *that
  one file*. Styling is not shared (a note in a 340px panel and a help page are different things),
  and a caller with no person pool to resolve against gets the plain text the link was written as
  rather than a link to nowhere.
- **`PHOTO_MAX_EDGE` and `BIRTH_YEAR_TOLERANCE` are newly exported** — not because any code needed
  them, but because the help page states both in words and a test pins the words to the constant.
- **`toReactFlowGraph` sets `ariaLabel` on every node and `focusable: false` on unions.** The label
  is what a card says out loud; see 7.3 below.
- **`ShellView` gained `"help"`,** and `SidebarNavItem` gained a key hint, shown the way the search
  box shows ⌘K.

### Judgement calls to preserve

- **The sample family's ids are fixed and prefixed (`demo-`), not random.** That buys three things
  at once: loading twice restores the sample rather than duplicating it, removing it is an exact set
  of rows rather than a guess, and a test can name a person. The alternative — an `isDemo` flag on
  `Person` — would ride in every backup and every GEDCOM export from now on to record something
  only ever true of fifteen rows in one browser.
- **`loadSampleTree` is additive and never a replacement,** and writes its own tree called "Sample
  family (demo)". The one thing a "try it before you commit" affordance must not be able to do is
  destroy what somebody already entered, and a demo that could be mistaken for the reader's own
  family halfway through an afternoon is nearly as bad.
- **It is the only place in the app that writes rows directly rather than through
  `createPerson`/`addRelationship`.** Those helpers are how *user input* becomes data, and they
  would refuse a second load — everyone already has their two parents. The invariants they enforce
  (no self-links, at most two parents, no cycles) are asserted against the fixture in a test
  instead, which is a stronger guarantee than a runtime check that only ever runs on data that
  cannot change.
- **`removeSampleTree` reuses `deletePerson` and is deliberately not one transaction.**
  `deletePerson` already owns what deleting a person means — the relationship sweep, the membership
  sweep, the photos, the documents, the refusal when somebody is a tree's root. A hand-rolled
  cascade would be a second definition of that, and the one most likely to miss the next table
  added (Phase 6 added documents to exactly this cascade). The cost is that a failure part-way
  leaves some of the sample behind, which is recoverable by pressing the button again because every
  step is idempotent.
- **Removal reports rather than hides.** A link broken to one of the reader's own people, a photo or
  document they attached to a sample person, a sample person kept back because they are the root of
  a tree the reader made — each is counted and named. The test for the first count is "one end is
  going *and the other end is theirs*", not "one end is going": a link between two sample people is
  entirely within the sample, and counting it would warn the reader about their own data losing
  something it never had. The dialog also says that a snapshot taken while the sample was loaded
  still contains it — the Phase 4 habit of stating the consequence rather than hiding it.
- **The sample carries no photos, and the fixture's own test says so.** Bundling faces for people
  who don't exist would grow an offline install; generating placeholder portraits would be inventing
  likenesses. The photo wall reads "0 of 15 people have a photo", which is true. There is no
  `requestPersistentStorage()` call either: the browser's one "keep this site's data" prompt should
  be spent on the first person somebody actually cares about.
- **The fixture must report *nothing at all* in the Health view, not merely no errors.** A shipped
  sample lighting up red would teach a first-time reader that the app is broken, and nothing in this
  data is undecidable, so zero findings is the honest bar. A test asserts `toEqual([])`.
- **The help pages are data, so the manual can be tested against the app it describes.** Every
  threshold quoted is asserted against the constant that owns it — 30-day staleness, 7-day snooze,
  10 snapshots, the 10-minute floor, 800px photos, the 25 MB document cap, the 100-year living
  presumption, the 2-year duplicate tolerance. The add-relative shortcut table is *derived* from
  `ADD_RELATIVE_KEYS`, with a `Record` exhaustive over its values, so a fourth binding fails to
  compile until it is described. An out-of-date manual is worse than none, because it is believed.
- **Numbers are written into the prose and pinned by a test, not interpolated.** A content module
  importing Dexie to quote a retention limit would be the wrong shape entirely. This is the same
  arrangement as the theme script in `index.html`: duplicate where sharing is impractical, and pin
  it with a test.
- **Help assertions read the rendered prose, not the source lines.** A claim that straddles a line
  break is one sentence on screen; the source file is not the thing the manual is judged on.
- **`searchHelp` requires every term and ranks a title match first.** A topic found by its title
  *or its summary* is offered whole, because a summary describes the whole topic and narrowing to
  the one section that repeats the word would answer a smaller question than the one asked. When the
  terms are spread across several sections with no single one holding them all, it falls back to the
  whole page rather than to nothing.
- **A card's aria-label carries its relationships, because the lines are what a screen reader can't
  read.** Spouses and parents by name, children by count: at most two parents and rarely more than
  two spouses, but a well-recorded family has nine children and a label nobody waits through is a
  label nobody hears. The outline is where children are enumerated. Clauses are separated by full
  stops, because that is where a screen reader pauses.
- **Union dots are not tab stops.** A union is a 12px dot whose meaning is already in both spouses'
  labels and spelled out in the outline, and the union nodes sit together at the end of the node
  array — so leaving them focusable would append a run of near-identical stops to the end of every
  tree's tab order for no information. They are labelled anyway, for a reader who arrives some other
  way. Person cards stay focusable in `orderFamilyGraph`'s order, which is the order they are drawn
  in.
- **An implicit union is never called a marriage.** It exists because two people share a child;
  saying "marriage" would assert something the data does not.
- **The outline nests spouses under their partner and children under the couple,** mirroring the
  canvas rather than transcribing it, and orders by the same comparator the canvas draws with so the
  two agree about who comes first. Somebody reachable twice is named again but not expanded — the
  reader still learns who a child's other parent is, and the list terminates. Which of the two
  places gets the expansion follows the same rule `orderFamilyGraph` documents for a cousin
  marriage, so the list and the picture stay consistent even there.
- **The outline is a real panel, not a hidden one.** An invisible list of focusable buttons is a trap
  for a sighted keyboard user, and a list worth offering to a screen reader is worth being able to
  look at — it is also simply a good way to find somebody in a large tree. It renders *outside*
  React Flow's `role="application"` subtree, where browse mode is not suppressed, and before the
  canvas in the DOM.
- **The outline is scoped to what is drawn,** taken from the rendered node array, so a focus view or
  a hidden generation narrows it exactly as it narrows the canvas. An outline listing people with no
  card would be describing a different tree — the same rule the keyboard navigation follows.

### Bugs found and fixed along the way

- **Three help pages had list items wrapped across two source lines.** `parseNotes` closes a list on
  the first line that isn't a bullet, so each rendered as a list, a stray paragraph and a second
  list — prose that looks right in the source and wrong on screen. The sample family's own notes had
  the same bug. Rather than write every bullet as one over-long string literal, `md()` folds a
  two-space-indented continuation onto the line before it, and a test checks every section of every
  page for the paragraph-after-list signature.
- **React Flow's per-card description was wrong,** and it is the one sentence read out on every
  card: "press delete to remove it" and "use the arrow keys to move the node around" are both false
  here (`elementsSelectable` is off, nothing is bound to Delete, and the arrows walk the family).
  Overriding `node.a11yDescription.default` alone changed nothing — React Flow renders the
  `keyboardDisabled` variant — so both are set. Found in the browser.
- **"Showing the 1 part of this page that match …"** in the help search. Found in the browser.

### Verified live

Loaded the sample from the welcome screen in the embedded browser, exercised all three features,
removed the sample and cleared the profile. Confirmed: the welcome screen offers "15 invented
people you can delete in one click from Settings" and one click produces a 15-person, 4-generation
tree rooted on Ravi Sawant with the adoption drawn dashed; Health reports **nothing at all**;
the photo wall reads "0 of 15 people have a photo"; `?` opens the help, whose search narrows
Relationships to its one section mentioning "triplets" and whose shortcut table lists P, S and C;
the outline reads exactly as its unit test asserts, down to "married 1969 · marriage ended" and
"· adopted"; following an entry selects that person's card and opens their detail panel; 15 person
cards are tab stops in family order, the first announced as "Ravi Sawant, 12 Mar 1888 – 4 Nov 1961.
Generation 1. Married to Sushila Sawant. No parents recorded. 2 children."; 6 union dots are
labelled and none is a tab stop; and removing the sample leaves 0 people, 0 relationships, 0 trees
and 0 members with the app back at its welcome screen.

### Not confirmed live

**The scroll-to half of following an outline entry.** React Flow's viewport transform stayed at the
identity in the embedded browser pane, including its own initial `fitView` — reproduced with the
canvas changes stashed, so it is not something this phase introduced. Worth a look in a real
browser window.

### Deferred from this phase

- **High-contrast mode**, still. Phase 3 declined to invent colour values; nothing here changed
  that, and the accessibility work in 7.3 is about structure rather than palette.
- **An automated accessibility audit** (axe, or similar) in the test run. Everything asserted here
  is asserted directly — labels, tab stops, list structure — which catches the specific things this
  phase is about but not the next regression somebody introduces elsewhere.

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
