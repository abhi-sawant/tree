import { useMemo } from "react"

import { parseNotes, type Block, type Inline } from "~/lib/notes/markdown"
import { cn } from "~/lib/utils"

// The one place a parsed Markdown block tree becomes React elements.
//
// Extracted from the notes view when the help pages needed the same subset:
// two walkers over the same tree would be two chances to forget a node kind,
// and the whole reason parseNotes returns data rather than an HTML string is
// that nothing downstream ever needs dangerouslySetInnerHTML. Keeping that
// property true is a property of *this file*, so there should only be one.
//
// What is not shared is how it looks. A note lives in a 340px panel beside a
// canvas; a help page is a page. The heading *tags* are the same in both —
// h3/h4/h5, because both are rendered under a heading the surrounding view
// owns — so only the classes vary.

export type MarkdownVariant = "compact" | "page"

const HEADING_TAGS = ["h3", "h4", "h5"] as const

const HEADING_CLASS: Record<MarkdownVariant, Record<1 | 2 | 3, string>> = {
  compact: {
    1: "font-heading text-sm font-semibold tracking-wide uppercase",
    2: "font-heading text-13 font-semibold tracking-wide uppercase",
    3: "font-heading text-11 font-semibold tracking-widest uppercase",
  },
  page: {
    1: "mt-1.5 font-heading text-sm font-semibold tracking-widest uppercase",
    2: "mt-1.5 font-heading text-13 font-semibold tracking-wide uppercase",
    3: "font-heading text-11 font-semibold tracking-widest uppercase",
  },
}

// How a [[name]] should render. The notes view resolves it against the live
// person pool and links to them; anything with no pool to resolve against gets
// the default below, which renders the name as the plain text it was written
// as rather than as a link that goes nowhere.
export type RenderPerson = (name: string) => React.ReactNode

interface MarkdownViewProps {
  source: string
  variant?: MarkdownVariant
  renderPerson?: RenderPerson
  className?: string
  // Rendered instead of nothing when the source has no blocks at all.
  empty?: React.ReactNode
}

export function MarkdownView({
  source,
  variant = "compact",
  renderPerson,
  className,
  empty,
}: MarkdownViewProps) {
  const blocks = useMemo(() => parseNotes(source), [source])

  if (blocks.length === 0) return <>{empty ?? null}</>

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 text-13 leading-relaxed",
        variant === "page" && "gap-3 text-sm",
        className
      )}
    >
      {blocks.map((block, i) => (
        <BlockView
          key={i}
          block={block}
          variant={variant}
          renderPerson={renderPerson}
        />
      ))}
    </div>
  )
}

interface WalkProps {
  variant: MarkdownVariant
  renderPerson?: RenderPerson
}

function BlockView({
  block,
  variant,
  renderPerson,
}: WalkProps & { block: Block }) {
  if (block.kind === "heading") {
    // One component rather than three, since the level is data. The tag is
    // picked from a fixed list, never built from the input.
    const Tag = HEADING_TAGS[block.level - 1]
    return (
      <Tag className={HEADING_CLASS[variant][block.level]}>
        <InlineList
          nodes={block.children}
          variant={variant}
          renderPerson={renderPerson}
        />
      </Tag>
    )
  }

  if (block.kind === "list") {
    const Tag = block.ordered ? "ol" : "ul"
    return (
      <Tag
        className={cn(
          "flex flex-col gap-1 pl-4",
          block.ordered ? "list-decimal" : "list-disc"
        )}
      >
        {block.items.map((item, i) => (
          <li key={i}>
            <InlineList
              nodes={item}
              variant={variant}
              renderPerson={renderPerson}
            />
          </li>
        ))}
      </Tag>
    )
  }

  return (
    <p>
      <InlineList
        nodes={block.children}
        variant={variant}
        renderPerson={renderPerson}
      />
    </p>
  )
}

function InlineList({
  nodes,
  variant,
  renderPerson,
}: WalkProps & { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, i) => (
        <InlineView
          key={i}
          node={node}
          variant={variant}
          renderPerson={renderPerson}
        />
      ))}
    </>
  )
}

function InlineView({
  node,
  variant,
  renderPerson,
}: WalkProps & { node: Inline }) {
  switch (node.kind) {
    case "text":
      return <>{node.text}</>
    case "strong":
      return (
        <strong className="font-semibold">
          <InlineList
            nodes={node.children}
            variant={variant}
            renderPerson={renderPerson}
          />
        </strong>
      )
    case "em":
      return (
        <em className="italic">
          <InlineList
            nodes={node.children}
            variant={variant}
            renderPerson={renderPerson}
          />
        </em>
      )
    case "code":
      return (
        <code className="bg-muted px-1 py-0.5 font-mono text-11">
          {node.text}
        </code>
      )
    case "person":
      return <>{renderPerson ? renderPerson(node.name) : node.name}</>
  }
}
