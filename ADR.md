# Architecture Decision Record

One log for every decision worth remembering, in the order it was taken. `SPEC.md` and `PHASES.md`
(the working documents that produced these) are gone once a phase ships — this file is what's kept.

Code comments cite decisions as `D<n>` (e.g. `// D14`). IDs are **never reused or renumbered**, so an
old comment still resolves. A decision that was later changed says so under **Status**; it is not
edited away.

---

## v1 — the original build (`D1`–`D17`)

### D1 — Static SPA, no server

**Status:** Accepted, load-bearing for everything below.
**Decision:** Client-only single-page app. All data lives in the browser (IndexedDB via Dexie). No
backend, no accounts, static hosting only.
**Why:** The app's defining property is that it works fully offline because there is nothing to be
offline _from_. Cloud sync and accounts would reopen this and are excluded permanently — not
deferred, excluded (see the v2 offline-constraint decision, `D18`).

### D2 — Selection opens a persistent detail panel

**Decision:** Selecting a canvas node opens a side panel to view/edit the person, list their
relationships, and reach contextual add-actions — not a transient popup form.

### D3 / D4 — Person delete cascades, but a tree root is a hard stop

**Decision:** Deleting a person cascades: their relationships, their `TreeMember` rows in every
tree, and their photo are all removed, after a confirmation dialog naming the affected trees. If the
person is the root of any tree, deletion is **blocked** with an actionable message — no silent
reassignment.
**Why:** A root is a structural anchor other data points at; silently picking a new one is a decision
the app has no basis for making.

### D5 — "Add sibling" auto-creates a placeholder parent

**Decision:** If the selected person has no recorded parents, "add sibling" creates a placeholder
parent rather than blocking the action.

### D6 — Placeholders are real people with a flag

**Decision:** `Person.isPlaceholder?: boolean`. Flagged visually (badge, dashed border) but otherwise
a normal person everywhere — list view, search, exports. A list-view filter can hide them; exports
never do, because they are structurally real nodes in the graph.

### D7 — Relationship caps and cycle prevention

**Decision:** At most 2 `parent-child` relationships per child; unlimited `spouse` relationships over
time; self-reference and cycles are rejected outright.

### D8 — Union nodes are derived, never stored

**Decision:** A child with one recorded parent attaches directly to that parent — no union node. Two
parents of a shared child with no recorded `spouse` relationship get a synthesized **implicit
union**, for rendering only. Real marriages produce a real union.
**Why:** Family trees aren't graph-theoretically trees — remarriage and cousin marriage create
cross-links. A union node keeps the layout graph a clean DAG and makes "children of this marriage"
unambiguous, without inventing a marriage the data doesn't assert.

### D9 — Auto-layout with persisted manual overrides

**Decision:** `elkjs` (`layered`) recomputes positions for every node with no saved override, after
every graph mutation. Dragging a node writes `x/y` to `TreeMember` and excludes it from then on.
"Re-layout tree" clears all overrides; "reset node" clears one.
**Why:** Without both affordances, override behaviour becomes opaque and frustrating.

### D10 — Add-relative actions offer an existing-person picker

**Decision:** Every contextual add action (parent, spouse, child) offers both "new person" and
"existing person" (search-select from the pool), reusing D7/D8's validation and derivation as-is.

### D11 — Adding an existing person to a tree offers to pull in their family

**Decision:** A pre-checked "Also add their immediate family — N people" (parents + spouse +
children) checkbox on the add-to-tree flow.
**Why:** Relationships are global but a tree only decides who's displayed — without this, adding one
person to a second tree renders them as a disconnected island.

### D12 — Root is a pure layout anchor, guarded not privileged

**Decision:** A tree's root can't be removed from that tree's membership, and the underlying person
can't be deleted (`D4`), without reassigning root first. Otherwise the root has no special effect on
what's displayed.

### D13 — JSON import is replace-only

**Status:** Accepted, unchanged through v2. Superseding merge/dedup import is a scoped future item
(`FUTURE-SCOPE.md §9`), not yet built.
**Decision:** Import wipes the local DB and restores from the envelope wholesale. A mismatched
`schema` version is rejected with a clear error. No merge/dedup.

### D14 — File exports are pool-wide by default; scoped exports say why

**Status:** Extended in Phase 6.
**Decision:** GEDCOM (and everything built the same way — `.ics`, JSON backup) always covers the
entire global pool, never just the open tree, because a file export is a _copy of the data_, not a
view of it. Phase 6 added the family book as a deliberate, named exception: it is scoped to the open
tree because a book is a document about _one_ family, not a data copy — the same reasoning that puts
statistics and the health validator's tree-membership check on opposite sides of the same question.

### D15 — Desktop-first

**Status:** Superseded by `D37`. Held from v1 through Phase 7; the mobile pass that revisits it is
recorded below.
**Decision:** Touch works via React Flow's built-in pan/zoom/select support. No dedicated mobile
interaction design (bottom-sheet panels, tap-triggered tooltips, a touch move-mode for dragging).

### D16 — No undo/redo

**Status:** Accepted; still the case through Phase 7. `FUTURE-SCOPE.md §11` scopes a session-only
command-stack design that would add it.
**Decision:** Every mutation is immediate and permanent, modulo the D3/D4 confirmation dialog.

### D17 — Photos are downscaled and re-encoded on upload

**Decision:** Client-side resize to an 800px longest edge, re-encoded to JPEG q0.8, before being
stored as a blob.
**Why:** Keeps JSON export size bounded and is the load-bearing assumption behind every later storage
decision (`D25`, `D30`) — a photo is capped, so the risk profile of "many photos" is known in advance.

---

## v2 — the phase programme (`D18`–`D35`)

Seven phases (see git history: PRs #15–#22) added 39 features on top of v1 without reopening `D1`.
Each entry below is a decision the phase work established that should outlive the phase notes.

### D18 — The offline constraint is absolute, and three ideas were dropped by it

**Decision:** No v2 feature may introduce a network dependency. This permanently rules out cloud
sync, accounts, sharing links, live map tiles, and LLM-assisted matching — not deferred, excluded, the
same standing as `D1`. Voice memories, encryption-at-rest, and i18n were separately declined by
explicit choice (respectively: out of scope, "forgot passphrase = permanent data loss" is too severe
a failure mode, and too large a mechanical refactor to fold into this programme).

### D19 — `PartialDate` comparisons: never assert what the data doesn't settle

**Decision:** A `PartialDate` denotes a _span_ ("1950" is the whole year). Use `definitelyBefore` /
`minimumYearsBetween` / `maximumYearsBetween` (`app/lib/partial-date.ts`) for anything that asserts a
fact. `comparePartialDate` collapses a bare year to 1 January and exists **only** for sort order — it
must never back a validator finding or a statistic.

### D20 — Aggregates may estimate; findings may not

**Decision:** The health validator (`app/lib/analysis/validate.ts`) never fires on an undecidable
comparison — a false accusation about someone's family is worse than a missed one, and the reader
can't tell the two apart. Statistics (`app/lib/analysis/statistics.ts`) may exclude ambiguous rows and
state the sample size instead.

### D21 — Destructive data operations refuse rather than guess

**Decision:** `mergePeople` stops when the two people are already recorded as related, or when the
merge would breach the two-parent cap. No auto-merge, no silent resolution.

### D22 — Scoping is a deliberate, per-feature choice

**Decision:** The validator and duplicate detector are whole-pool ("belongs to no tree" is only
meaningful pool-wide). Statistics, the family book, and the photo wall default to the open tree
("the average lifespan in my family" means the family on screen). File exports are pool-wide per
`D14`. A new feature must decide this explicitly rather than copy whichever is nearest.

### D23 — Share the rule, not the copy

**Decision:** Wherever two places could independently compute the same fact, one function owns it
and the other calls it: `personDisplayName` (and its exported `personNameSegments`) for display
names, `exactCalendarDay` for which dates are real anniversaries, `NameIndex` for resolving a typed
name to a person (shared by CSV import and `[[wiki links]]`), `recordOrderComparator` for sibling
order (shared by layout, keyboard navigation, and the accessibility outline), `notesToPlainText`
alongside the note parser. A second implementation is a bug waiting to disagree with the first.

### D24 — The Dexie change signal is middleware, not a helper convention

**Decision:** Durability features that need to know "something changed" hook a single piece of
DBCore middleware (`app/lib/db/change-signal.ts`), not a call sprinkled through `app/lib/db/*`
helpers. It fires per low-level operation (always debounce via `createChangeScheduler`), fires
_before_ commit (a listener must be idempotent — an aborted write can still signal), and excludes
`appMeta`/`snapshots`/`backupTargets` (bookkeeping tables) to avoid feeding itself in a loop. A
throwing listener is swallowed, since letting it propagate would turn a broken banner into a rejected
write.

### D25 — Rolling snapshots exclude photos and documents; folder backup includes everything

**Decision:** An in-app snapshot (guards against a bad merge or mistaken delete) skips photo and
document blobs — they're most of the bytes and almost none of the risk. The folder auto-backup is a
real backup and carries everything. `MIN_AUTO_INTERVAL_MS` (10 min) between auto-snapshots is what
lets ten of them span a two-hour session instead of all landing in the last minute. No off-switch for
snapshots exists, and none is planned — turning off the app's own safety net is a foot-gun, and the
storage cost is kilobytes.

### D26 — Folder backup never rotates or deletes

**Decision:** One file per calendar day, written via `createWritable`'s atomic rename-on-close so a
crash mid-write can't corrupt it. Nothing is ever deleted from a folder the user owns — a month-old
backup is worth more than directory tidiness. Folder permission is never silently re-requested
(`requestPermission` needs a user gesture); a failed write is recorded per-target rather than treated
as a silent no-op, which would be indistinguishable from a working backup.

### D27 — Multi-tab: presence is a heartbeat, restore is a latching warning

**Decision:** A second tab open is not a problem (liveQuery keeps both in sync) — a quiet grey
indicator. A **restore** performed in another tab is a real problem — the current tab's next edit
would overwrite the restored data — so it gets a destructive-coloured banner that **latches** and
demands a reload. Presence uses heartbeat-with-expiry rather than register/deregister, since a
force-quit tab never says goodbye. Leader election is lowest-id-wins with no negotiation, degrading to
permanent leadership if `BroadcastChannel` is unavailable rather than disabling backups outright.

### D28 — `photoIds` is the source of truth; `photoId` is a kept mirror

**Decision:** `Person.photoIds` (ordered array) is authoritative once Phase 6 added multiple photos
per person; `Person.photoId` continues to mirror `photoIds[0]`. The scalar field is not removed.
**Why:** Data and backups already in people's hands carry only `photoId` — dropping it would make an
old build importing a new backup show every face as a default avatar. `photoFieldsFor` is the one
place both fields are written.

### D29 — Documents are a separate, uncapped, closed-type store

**Decision:** Attachments (scans, PDFs) get their own Dexie table, not a `Photo` variant: a document
must not be downscaled the way a photo is, since the point of a scan is that small print stays
readable. Closed type list (PDF, image), 25 MB per file. Excluded from GEDCOM (5.5.1 has no PDF media
type) and from snapshots (same reasoning as `D25`, more so — full-size storage, no display value).

### D30 — Privacy redaction inverts the validator rule: undecidable resolves to _redact_

**Decision:** Canvas-time redaction of living people (for PNG/PDF/GEDCOM export) treats every
undecidable case — including no dates at all — as "still possibly living, so hide it." This is the
opposite of `D20`: wrongly hiding a dead person's dates costs a reader one lookup, wrongly publishing
a living person's costs something unrecoverable. The JSON backup is exempt from redaction and states
so — it's the user's own complete copy and the thing the whole durability effort (`D24`–`D27`) exists
to encourage; redacting it would turn the safety net into a data-loss mechanism.

### D31 — Sample/demo data is additive, fixed-ID, and bypasses the normal write path

**Decision:** The bundled sample family uses fixed, `demo`-prefixed IDs (not random) and is the one
place in the app that writes rows directly rather than through `createPerson`/`addRelationship` — the
normal helpers enforce invariants (two-parent cap, no cycles) that would reject loading a
fully-formed, pre-linked fixture. `loadSampleTree` is additive-only and never a replacement.
`removeSampleTree` reuses `deletePerson` per-row rather than a hand-rolled cascade, so it can't drift
from whatever cascade rule `deletePerson` owns as the schema grows.

### D32 — Notes parse to data, never to an HTML string

**Decision:** The markdown-subset note parser (`app/lib/notes/markdown.ts`, rendered by the shared
`MarkdownView`) produces a small AST that the renderer walks into React elements. There is no
`dangerouslySetInnerHTML` anywhere in that path — arbitrary text (including something that looks like
a script tag) in a note is always inert text on screen.

### D33 — CSV is a lossy spreadsheet view, not an interchange format

**Decision:** CSV import/export carries names, sex, dates, notes, and parent/spouse structure by
_name_ (no UUIDs in a spreadsheet). It cannot carry photos, custom fields, marriage dates, or
relationship subtype. Import is additive and never rewrites an existing link — safe specifically
because the fields CSV can't see, it also can't damage. This is a narrower contract than `D13`'s JSON
import, and deliberately so.

### D34 — Accessibility: labels carry structure, structure isn't flattened onto a screen reader by accident

**Decision:** Every card's generated `ariaLabel` states its relationships (spouses and parents by
name, children by count) because that's what a screen reader can't otherwise reach. Union nodes are
labelled but are **not** tab stops — their meaning is already in both spouses' labels and in the
outline. A visible tree-outline panel (not a visually-hidden one) mirrors the canvas nesting and is
scoped to whatever is actually drawn (a focus view or hidden generation narrows both together).

### D35 — High-contrast mode and an automated a11y audit are both still open

**Status:** Deliberately deferred, not forgotten.
**Decision:** Phase 3 declined to invent a third colour palette without a real design pass; Phase 7's
accessibility work addressed structure (labels, tab order, the outline), not colour. Neither an axe
-style automated audit nor high-contrast palette values exist yet. The mobile pass this was expected
to ship alongside has since happened (`D37`) without them, so they remain open on their own.

---

## The mobile pass (`D36`–`D37`)

### D36 — A dismissed health finding is data, identified by content

**Decision:** A health finding or duplicate pair the reader has looked at and rejected is stored in
its own Dexie table (`dismissals`, version 7) and filtered out of the Health view. Its key is the
rule's `code` plus the person ids it names, sorted — **not** an id, because neither findings nor
duplicate pairs are stored: both are recomputed from the graph on every render, so there is nothing
to hang an id on.

**Why identity by content is safe:** a dismissal silences _that_ rule about _those_ people and
nothing else. Correct a date so a different rule fires about the same person and the new finding
surfaces, because it is a different claim. What a dismissal can never do is hide something the
reader has not already read and rejected. Person ids are sorted because the order the validator
lists them in is presentation — whom to take the reader to first (`D34`) — and presentation must not
decide identity.

**Consequences that follow:** nothing is silenced irreversibly, so a "Dismissed" section lists
everything and takes it back — a check somebody turned off months ago and cannot find again is a
check the app has stopped doing while implying it hasn't. `deletePerson` cascades to dismissals
naming that person, and a restore drops any whose people the backup doesn't contain: in both cases
the row could never match again, and could silence a genuine finding if the id were ever reissued.

Dismissals ride in the JSON backup as an **additive field with a default**, the pattern the
`attachments` array already documents — no envelope bump, and a build older than this one still
reads a newer file. They are the reader's own judgements about their own data, and a restore that
reported the three things they had already decided were fine would be a restore that lost
something. They are _not_ excluded from the change signal (`D24`), so they ride in snapshots too.

**Also decided here:** "Re-check" moves a `checked N minutes ago` stamp and re-runs the
computation, and says nothing stronger. The checks are live queries and are never stale, so a
button that claimed to refresh them would be lying about the one thing this view exists to be
trusted on.

### D37 — Three viewport tiers, and the canvas keeps the screen

**Status:** Accepted. Supersedes `D15`; closes `FUTURE-SCOPE.md §10`.
**Decision:** The app is responsive across three tiers, expressed in markup as `max-md:` /
`md:max-lg:` / `lg:` and in TypeScript by `app/lib/ui/viewport-tier.ts`, whose constants are pinned
by a test to Tailwind's own `md` and `lg`:

- **mobile (<768px)** — no sidebar; a four-tab bottom bar (Tree · People · Photos · More); the
  detail panel, the canvas toolbar and every menu become sheets.
- **tablet (768–1023px)** — the desktop shell, but the sidebar collapses to a 56px icon rail and
  the detail panel is a sheet.
- **desktop (≥1024px)** — unchanged from before this pass.

**Why three and not two:** the two things the desktop shell puts beside the canvas stop fitting at
different widths. A 360px detail rail is already unaffordable on a tablet; the 212px sidebar only
becomes unaffordable on a phone. One breakpoint would either keep a rail that doesn't fit or drop a
sidebar that does.

**What this decided along the way:**

- **"More" is a view, not a drawer.** The bottom bar stays lit under it, so the reader is somewhere
  rather than in front of something. A sub-screen lights the tab it was opened from, because
  "nowhere" is never an honest answer to where you are.
- **One `SidebarContent`, three presentations.** A destination that exists on one tier and not
  another is how a feature quietly becomes unreachable on a phone (`D23`).
- **Dialogs restyle; sheets are for gestures.** Every dialog becomes bottom-anchored below `md`
  through one class string apiece. `ui/sheet.tsx` (on Base UI's `Drawer` — already a dependency, so
  `D1`/`D18` stand) is reserved for surfaces that genuinely want a handle, a snap point, or a live
  background.
- **The detail sheet is non-modal.** The canvas behind the peek stays pannable, so walking the tree
  with a record open is not a close-then-reopen per step.
- **Long press is ours, not the context menu's.** On the canvas the gesture must lose to a drag —
  the same finger on the same card means "pin it here" if it travels and "show me the actions" if it
  doesn't — so its cancel threshold and React Flow's `nodeDragThreshold` are the same number.
- **Two hit areas were dishonest and are now honest.** Connection handles are invisible 8px targets
  on a card's edge, exactly where a pan starts, and are disabled under a coarse pointer; adding a
  relative through the sheet records the same link. A marriage dot gets an invisible pad without
  moving, since where the edges meet is the only place it means anything.
- **Where the mockup and the model disagreed, the model won.** The design draws `birthplace` and
  `occupation` as first-class fields and shows one being edited in a table row; here they are
  `customFields`, so no column was invented. Search was extended to notes and custom fields instead,
  which made the design's own "names, places and notes" true.

**Still open:** drag-to-connect has no touch equivalent, only a touch _absence_ — the add-relative
flows cover the same outcome. Whether `birthplace` and `occupation` deserve real columns is a
schema question this pass deliberately did not answer.

---

## Where to look next

- **Current/future work:** [`FUTURE-SCOPE.md`](./FUTURE-SCOPE.md) — kept up to date with what's
  actually still open, now that the phase programme it once sat below is complete.
- **Conventions for extending this codebase:** [`CLAUDE.md`](./CLAUDE.md).
