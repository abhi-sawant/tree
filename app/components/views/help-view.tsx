import { useMemo, useState } from "react"

import { MarkdownView } from "~/components/markdown/markdown-view"
import { Button } from "~/components/ui/button"
import {
  searchHelp,
  type HelpSection,
  type HelpShortcut,
} from "~/lib/help/help-content"
import { cn } from "~/lib/utils"

// The bundled manual. No network, no iframe, no external links — the pages are
// data in the bundle, rendered by the same Markdown walker a person's notes go
// through.
export function HelpView() {
  const [query, setQuery] = useState("")
  const [chosenId, setChosenId] = useState<string | undefined>(undefined)
  // Set by a search hit so the page opens showing only what matched; cleared by
  // "Show the whole page" and by picking a topic from the list.
  const [narrowed, setNarrowed] = useState(true)

  const results = useMemo(() => searchHelp(query), [query])

  // The chosen topic if it is still among the results, otherwise the first
  // result. Typing into the search must not leave the reader looking at a page
  // that is no longer in the list beside it.
  const current =
    results.find((result) => result.topic.id === chosenId) ?? results[0]

  const sections: HelpSection[] =
    narrowed && current && current.sections.length > 0
      ? current.sections
      : (current?.topic.sections ?? [])

  const hiddenCount = current
    ? current.topic.sections.length - sections.length
    : 0

  return (
    <div className="flex min-h-0 flex-1">
      <nav
        aria-label="Help topics"
        className="flex w-60 flex-none flex-col gap-2 overflow-y-auto border-r border-border p-3"
      >
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setNarrowed(true)
          }}
          placeholder="Search the help…"
          aria-label="Search the help"
          className="h-8 w-full border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        />
        {results.length === 0 ? (
          <p className="px-1 py-2 text-11 text-muted-foreground">
            Nothing here mentions all of that. Try one word.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {results.map((result) => {
              const active = result.topic.id === current?.topic.id
              return (
                <li key={result.topic.id}>
                  <button
                    type="button"
                    // Marks the open page for a screen reader, which otherwise
                    // has only the background colour to go on.
                    aria-current={active ? "page" : undefined}
                    onClick={() => {
                      setChosenId(result.topic.id)
                      setNarrowed(true)
                    }}
                    className={cn(
                      "flex w-full cursor-pointer flex-col gap-0.5 border-l-2 px-2 py-1.5 text-left hover:bg-muted",
                      active
                        ? "border-primary bg-primary/10"
                        : "border-transparent"
                    )}
                  >
                    <span className="text-xs font-semibold">
                      {result.topic.title}
                    </span>
                    <span className="text-10 leading-snug text-muted-foreground">
                      {result.topic.summary}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-6">
        {current && (
          <article className="flex max-w-2xl flex-col gap-5">
            <header className="flex flex-col gap-1">
              <h2 className="font-heading text-sm font-semibold tracking-widest uppercase">
                {current.topic.title}
              </h2>
              <p className="text-13 text-muted-foreground">
                {current.topic.summary}
              </p>
            </header>

            {hiddenCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 border border-border p-2.5">
                <span className="text-12-5 text-muted-foreground">
                  Showing the {sections.length}{" "}
                  {sections.length === 1 ? "part" : "parts"} of this page that
                  match &ldquo;{query.trim()}&rdquo;.
                </span>
                <Button
                  variant="outline"
                  size="xs"
                  className="ml-auto"
                  onClick={() => setNarrowed(false)}
                >
                  Show the whole page
                </Button>
              </div>
            )}

            {sections.map((section) => (
              <section key={section.heading} className="flex flex-col gap-2">
                <h3 className="font-heading text-13 font-semibold tracking-wide uppercase">
                  {section.heading}
                </h3>
                <MarkdownView source={section.body} variant="page" />
                {section.shortcuts && (
                  <ShortcutTable shortcuts={section.shortcuts} />
                )}
              </section>
            ))}
          </article>
        )}
      </div>
    </div>
  )
}

// A description list rather than a table: each row is a term and its meaning,
// which is what a shortcut list is, and it reads correctly to a screen reader
// without needing column headers that would say nothing.
function ShortcutTable({ shortcuts }: { shortcuts: HelpShortcut[] }) {
  return (
    <dl className="flex flex-col border border-border">
      {shortcuts.map((shortcut) => (
        <div
          key={shortcut.keys}
          className="flex items-center gap-3 border-b border-border px-2.5 py-1.5 last:border-b-0"
        >
          <dt className="w-24 flex-none">
            <kbd className="border border-border bg-muted px-1.5 py-0.5 font-mono text-11">
              {shortcut.keys}
            </kbd>
          </dt>
          <dd className="text-12-5">{shortcut.description}</dd>
        </div>
      ))}
    </dl>
  )
}
