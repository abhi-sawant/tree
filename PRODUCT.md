# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Primary: a family historian — one enthusiast researching and recording their family over many
sessions: dates, photos, documents, notes, duplicates to merge, GEDCOM/CSV/PDF exports. Works on desktop
mostly, but also on phone and tablet (three responsive tiers, ADR D37). Other relatives may be shown the
tree, but the historian is the one building it. The owner wants the app to feel friendly and easy
rather than like genealogy software.

## Product Purpose
A local-first family tree builder: draw and edit trees on an interactive canvas, browse people in a
searchable table, attach photos and documents, check data health, and export (JSON, CSV, PNG/PDF,
GEDCOM, printable family book). Success: a person with no genealogy experience can add their first
relatives in minutes, and a serious researcher never hits a missing capability.

## Positioning
Works fully offline with no account, no server and no sync — all data lives in the browser (IndexedDB).
Installable PWA. Nothing leaves the device (ADR D1, D18).

## Capabilities and Constraints
- Multiple trees over one pool of people; a person can be in several trees.
- Canvas with generation layout, union (marriage) nodes, relationship subtypes (adopted, step, foster),
  multiple births, placeholders, partial/approximate dates, custom fields, notes, photos, documents.
- Views: Tree, People table, Photo wall, Insights, Health checks, Settings, Help; command palette search.
- No network dependency ever: no CDN fonts, tiles or fetches. Fonts must be bundled.
- Mutations only through `app/lib/db/*`; no `dangerouslySetInnerHTML`.
- Three viewport tiers: mobile <768, tablet 768–1023, desktop >=1024.
- Redesign may change layout, placement, colour and flows but must not remove or break functionality.

## Brand Commitments
Name: "Family Tree". No existing logo beyond an "FT" monogram. Current deep-green primary is NOT binding.

## Evidence on Hand
Bundled invented sample family (Sawant/Nair/Pereira, four generations) in `app/lib/demo/sample-tree.ts`.
Mobile screen catalog in `design/mobile/`. No real user photos ship; none may be fabricated.

## Product Principles
1. Friendly first, powerful underneath: the first minute needs no genealogy vocabulary.
2. The tree is the home screen; everything else serves it.
3. Never guess what the data doesn't say (partial dates, uncertain relationships stay honest).
4. Private and offline is a feature people should feel, not read about.
