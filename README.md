# Family Tree Generator

A local-first family tree builder: draw and edit trees on an interactive canvas, browse people in a searchable list,
and export to JSON, CSV, PNG/PDF, GEDCOM, or a printable family book.

Client-only single-page app — all data lives in the browser (IndexedDB via Dexie). No backend, no accounts. Built
to be installable as a PWA and to work fully offline.

See [ADR.md](./ADR.md) for why it's built this way, [CLAUDE.md](./CLAUDE.md) for conventions when working in this
codebase, and [FUTURE-SCOPE.md](./FUTURE-SCOPE.md) for what's still open.

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
