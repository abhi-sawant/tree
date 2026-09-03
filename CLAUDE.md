# CLAUDE.md

Client-only React PWA family tree builder. All data lives in the browser (IndexedDB via Dexie) — no
backend, no accounts, ever. See [`ADR.md`](./ADR.md) for why, and for every other load-bearing
decision. See [`FUTURE-SCOPE.md`](./FUTURE-SCOPE.md) for what's still open.

## Commands

```bash
npm run dev         # start dev server
npm run build        # static dist/ bundle
npm run test          # vitest
npm run typecheck   # tsc
npm run format        # prettier --write, ONLY on files you touched — see below
```

## Non-negotiables

- **No network dependency, ever.** Not a fetch call, not a CDN font, not a map tile. This is the
  entire reason the app works offline (ADR D1, D18).
- **Mutations go through `app/lib/db/*` helpers** (`createPerson`, `addRelationship`,
  `deletePerson`, `mergePeople`, …). Never write to `db.*` from UI code.
- **Never `dangerouslySetInnerHTML`.** Notes parse to a data structure and render as React elements
  (ADR D32).
- **Prefer injecting `now`/`Date` over reading the clock** in anything under `app/lib/`, so tests can
  pin behaviour.
- **Dexie versions indexes, not fields.** A new optional `Person`/`Relationship` field needs no
  `version()` bump. A new _table_ does.

## Responsive

Three tiers (ADR D37), expressed as Tailwind variants in markup and by
`app/lib/ui/viewport-tier.ts` where JavaScript has to branch:

| Tier    | Width        | Variant      | What changes                                     |
| ------- | ------------ | ------------ | ------------------------------------------------ |
| mobile  | `<768px`     | `max-md:`    | bottom bar, no sidebar, sheets instead of panels |
| tablet  | `768–1023px` | `md:max-lg:` | icon rail, detail panel as a sheet               |
| desktop | `≥1024px`    | `lg:`        | unchanged                                        |

- **Reach for CSS first.** Use `useIsMobile()` / `useIsCompact()` only where the branch decides
  _which component renders_ — an `<aside>` versus a `<Sheet>` — not where a class would do.
- **A new dialog needs no mobile work.** `ui/dialog.tsx` and `ui/alert-dialog.tsx` already present
  as bottom sheets below `md`. Reach for `ui/sheet.tsx` only when the surface wants a drag handle, a
  snap point, or a live background behind it.
- **Small buttons are already handled.** `size="xs"`/`"icon-xs"`/`"sm"`/`"icon-sm"` carry a 44px
  floor below `md`; don't add per-call-site touch sizing.
- **A tooltip carries nothing on touch.** If a tooltip is the only place something is explained —
  why a control is disabled, what a toggle does — write it into the markup for `max-md:` too.

## Before making a judgement call

Read [`ADR.md`](./ADR.md) first — many "obvious" choices here (scoping a feature to the open tree vs.
the whole pool, whether an ambiguous date should count as a match, whether to guess or refuse) were
already litigated and the reasoning is written down. Silently re-deciding one differently is how two
similar features end up disagreeing.

## Testing

Vitest + `fake-indexeddb` (`vitest.setup.ts`). Tests sit beside their subject as `*.test.ts`. The
GEDCOM writer and the graph→ELK adapter (union-node derivation, DAG validity) are the modules with the
least room for a quiet regression — keep their coverage strong.
