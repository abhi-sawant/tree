# Mobile design catalog

The source of truth for the mobile pass (ADR D37). Extracted from the bundled Claude Design
canvas the design was authored in, so it is checked in rather than kept in a download folder.

- **`screens.txt`** — every screen's copy, in order, under a `===== M Screen name =====` heading.
  Read this first: the wording in the app should match it.
- **`screens.html`** — the raw markup, 45 artboards at 390×844. Each screen is a
  `<div data-screen-label="M …">`, so `grep -n 'data-screen-label="M Tree view default"'` finds
  one. It is 300KB of inline styles; grep it, don't open it.

Where the catalog and the data model disagree, the model wins and the divergence is recorded in
ADR D37 — the mockup shows `birthplace` and `occupation` as first-class fields, but in this schema
they are `customFields` (see the comment on `CustomField` in `app/lib/types.ts`).
