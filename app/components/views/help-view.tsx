import { useMemo, useState } from "react"

import { MarkdownView } from "~/components/markdown/markdown-view"
import { MobileScreenHeader } from "~/components/shell/mobile-screen-header"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  searchHelp,
  type HelpSection,
  type HelpShortcut,
} from "~/lib/help/help-content"
import { useIsMobile } from "~/lib/ui/viewport-tier"
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
  //
  // The fallback is dropped on a phone. There the list and the page are the
  // same screen rather than two, so falling back to the first result would
  // open a topic nobody picked and the list would never be seen at all.
  const isMobile = useIsMobile()
  const chosen = results.find((result) => result.topic.id === chosenId)
  const current = isMobile ? chosen : (chosen ?? results[0])

  const sections: HelpSection[] =
    narrowed && current && current.sections.length > 0
      ? current.sections
      : (current?.topic.sections ?? [])

  const hiddenCount = current
    ? current.topic.sections.length - sections.length
    : 0

  return (
    <>
      {/* On a phone the two panes are one screen at a time: the list, then the
          page, with the header's back arrow stepping between them. A 240px
          non-shrinking rail beside a 240px content pane annihilates both. */}
      <MobileScreenHeader
        title={current ? current.topic.title : "Help"}
        detail={current ? undefined : "The bundled manual"}
        onBack={current ? () => setChosenId(undefined) : undefined}
      />
      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <nav
          aria-label="Help topics"
          className={cn(
            "flex w-60 flex-none flex-col gap-2 overflow-y-auto border-r border-border p-3",
            "max-md:w-full max-md:flex-1 max-md:border-r-0 max-md:p-4",
            current && "max-md:hidden"
          )}
        >
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setNarrowed(true)
            }}
            placeholder="Search the help…"
            aria-label="Search the help"
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
                        "max-md:min-h-14 max-md:flex-row max-md:items-center max-md:gap-3 max-md:rounded-xl max-md:border-l-0 max-md:px-3.5",
                        active
                          ? "border-primary bg-primary/10"
                          : "border-transparent"
                      )}
                    >
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-xs font-semibold max-md:text-15">
                          {result.topic.title}
                        </span>
                        <span className="text-10 leading-snug text-muted-foreground max-md:text-12-5">
                          {result.topic.summary}
                        </span>
                      </span>
                      <span className="hidden text-muted-foreground max-md:ml-auto max-md:block">
                        ›
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </nav>

        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col overflow-y-auto p-6 max-md:p-4",
            !current && "max-md:hidden"
          )}
        >
          {current && (
            <article className="flex max-w-2xl flex-col gap-5">
              <header className="flex flex-col gap-1">
                <h2 className="font-heading text-sm font-semibold">
                  {current.topic.title}
                </h2>
                <p className="text-13 text-muted-foreground">
                  {current.topic.summary}
                </p>
              </header>

              {hiddenCount > 0 && (
                <div className="flex flex-wrap items-center gap-2 border border-border p-2.5">
                  <span className="text-12-5 text-muted-foreground">
                    {sections.length === 1
                      ? "Showing the one part of this page that mentions"
                      : `Showing the ${sections.length} parts of this page that mention`}{" "}
                    &ldquo;{query.trim()}&rdquo;.
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
                  <h3 className="font-heading text-13 font-semibold">
                    {section.heading}
                  </h3>
                  <MarkdownView source={section.body} variant="page" />
                  {section.shortcuts && (
                    <ShortcutTable shortcuts={section.shortcuts} />
                  )}
                </section>
              ))}
              {/* Reached from the list on a phone, where the header's back arrow
                is the only way out — but a topic is also worth stepping
                between, which the pager below does on every tier. */}
              <HelpPager
                results={results}
                currentId={current.topic.id}
                onChoose={(id) => {
                  setChosenId(id)
                  setNarrowed(true)
                }}
              />
            </article>
          )}
        </div>
      </div>
    </>
  )
}

// Previous and next topic, in the order the manual is written. A reader who
// finishes a page has nowhere to go otherwise but back to the list, which on a
// phone is a screen away.
function HelpPager({
  results,
  currentId,
  onChoose,
}: {
  results: Array<{ topic: { id: string; title: string } }>
  currentId: string
  onChoose: (id: string) => void
}) {
  const index = results.findIndex((result) => result.topic.id === currentId)
  const previous = index > 0 ? results[index - 1].topic : undefined
  const next =
    index >= 0 && index < results.length - 1
      ? results[index + 1].topic
      : undefined
  if (!previous && !next) return null

  return (
    <nav
      aria-label="Help topics, in order"
      className="flex items-center gap-2 border-t border-border pt-4"
    >
      {/* Titles here are whole sentences ("Finding and fixing problems"), and
          a button is whitespace-nowrap by default — so the width has to be
          capped and the label allowed to wrap, or the pair runs off the edge
          of a 390px screen. */}
      {previous && (
        <Button
          variant="outline"
          size="sm"
          className="h-auto max-w-[48%] py-2 text-left whitespace-normal"
          onClick={() => onChoose(previous.id)}
        >
          ‹ {previous.title}
        </Button>
      )}
      {next && (
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-auto max-w-[48%] py-2 text-right whitespace-normal"
          onClick={() => onChoose(next.id)}
        >
          {next.title} ›
        </Button>
      )}
    </nav>
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
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-2.5 py-1.5 last:border-b-0 max-md:py-2.5"
        >
          <dt className="w-24 flex-none max-md:w-auto max-md:min-w-24">
            <kbd className="rounded-lg border border-border bg-muted px-1.5 py-0.5 font-mono text-11">
              {shortcut.keys}
            </kbd>
          </dt>
          <dd className="text-12-5">{shortcut.description}</dd>
        </div>
      ))}
    </dl>
  )
}
