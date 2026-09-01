// A deliberately small Markdown subset for the notes field, plus [[wiki links]]
// to other people.
//
// Two constraints shape it. It carries no dependency, because pulling a
// Markdown library in for a notes box would be by far the largest thing in the
// bundle. And it produces a tree of plain data, never a string of HTML: the
// renderer walks this and builds React elements, so there is no
// dangerouslySetInnerHTML anywhere and a note that happens to contain
// "<img onerror=...>" is text, the way the person who typed it meant it.
//
// The subset is what people actually write in a free-text field: headings,
// bullet and numbered lists, bold, italic, inline code, and links to relatives.
// Not tables, blockquotes, images or raw HTML — a genealogy note is prose, and
// every construct added here is one more thing that can surprise someone who
// only wanted to type an apostrophe.

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] }
  | { kind: "code"; text: string }
  // The person's name exactly as written between the brackets. Resolution
  // happens at render time against the live pool, so a note doesn't go stale
  // when somebody is renamed or merged away.
  | { kind: "person"; name: string }

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; children: Inline[] }
  | { kind: "paragraph"; children: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }

const WIKI_LINK = /\[\[([^\][]+)\]\]/
const STRONG = /\*\*([^*]+)\*\*/
const EM = /(?<!\*)\*([^*]+)\*(?!\*)/
const CODE = /`([^`]+)`/

// Ordered so the longest marker is tried first: "**bold**" must not be read as
// an empty italic wrapping "*bold*".
const INLINE_RULES: Array<{
  pattern: RegExp
  build: (capture: string) => Inline
}> = [
  { pattern: CODE, build: (text) => ({ kind: "code", text }) },
  {
    pattern: WIKI_LINK,
    build: (name) => ({ kind: "person", name: name.trim() }),
  },
  {
    pattern: STRONG,
    build: (text) => ({ kind: "strong", children: parseInline(text) }),
  },
  {
    pattern: EM,
    build: (text) => ({ kind: "em", children: parseInline(text) }),
  },
]

export function parseInline(text: string): Inline[] {
  if (text === "") return []

  // Whichever marker appears earliest wins, so "*a* and `b`" and "`b` and *a*"
  // both come out in the order they were written.
  let best: { index: number; length: number; node: Inline } | undefined
  for (const { pattern, build } of INLINE_RULES) {
    const match = pattern.exec(text)
    if (!match) continue
    if (best === undefined || match.index < best.index) {
      best = {
        index: match.index,
        length: match[0].length,
        node: build(match[1]),
      }
    }
  }

  if (!best) return [{ kind: "text", text }]

  const before = text.slice(0, best.index)
  const after = text.slice(best.index + best.length)
  return [
    ...(before ? [{ kind: "text" as const, text: before }] : []),
    best.node,
    ...parseInline(after),
  ]
}

const HEADING = /^(#{1,3})\s+(.*)$/
const BULLET = /^\s*[-*+]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/

export function parseNotes(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n")
  const blocks: Block[] = []

  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | undefined

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    // Joined with a space rather than kept as separate lines: a soft-wrapped
    // sentence typed across two lines is one sentence.
    blocks.push({
      kind: "paragraph",
      children: parseInline(paragraph.join(" ").trim()),
    })
    paragraph = []
  }
  const flushList = () => {
    if (!list) return
    blocks.push({
      kind: "list",
      ordered: list.ordered,
      items: list.items.map(parseInline),
    })
    list = undefined
  }
  const flushAll = () => {
    flushParagraph()
    flushList()
  }

  for (const line of lines) {
    if (line.trim() === "") {
      flushAll()
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      flushAll()
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3,
        children: parseInline(heading[2].trim()),
      })
      continue
    }

    const bullet = BULLET.exec(line)
    const numbered = bullet ? null : NUMBERED.exec(line)
    if (bullet || numbered) {
      const ordered = !!numbered
      const item = (bullet ?? numbered)![1]
      flushParagraph()
      // A numbered list starting where a bulleted one left off is two lists,
      // not one list that changes its mind halfway down.
      if (list && list.ordered !== ordered) flushList()
      if (!list) list = { ordered, items: [] }
      list.items.push(item)
      continue
    }

    flushList()
    paragraph.push(line)
  }

  flushAll()
  return blocks
}

// Every [[name]] in a note, in the order written and deduplicated. Used to show
// a person's outgoing links without rendering the whole note.
export function wikiLinkNames(source: string): string[] {
  const names: string[] = []
  const pattern = new RegExp(WIKI_LINK.source, "g")
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    const name = match[1].trim()
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}
