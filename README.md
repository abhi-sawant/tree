# Family Tree Generator

A local-first family tree builder: draw and edit trees on an interactive canvas, browse people in a searchable list,
and export to JSON, PNG/PDF, or GEDCOM. See [SPEC.md](./SPEC.md) for the full specification and [PLAN.md](./PLAN.md)
for the implementation plan.

Client-only single-page app — all data lives in the browser (IndexedDB via Dexie). No backend, no accounts. Built
to be installable as a PWA and to work fully offline.

## Development

```bash
npm run dev
```

## Build

Produces a static `dist` bundle suitable for any static host.

```bash
npm run build
```

## Tests

```bash
npm run test
```

## Adding shadcn/ui components

```bash
npx shadcn@latest add button
```

Components are placed in `app/components/ui` and imported as:

```tsx
import { Button } from "@/components/ui/button"
```
