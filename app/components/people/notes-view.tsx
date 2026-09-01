import { useMemo } from "react"

import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { personNodeId } from "~/lib/graph/node-ids"
import { parseNotes, type Block, type Inline } from "~/lib/notes/markdown"
import { NameIndex } from "~/lib/people/name-index"
import { cn } from "~/lib/utils"
import type { Person } from "~/lib/types"

interface NotesViewProps {
  notes: string
  // The whole pool, not just this tree: a note can name a relative who hasn't
  // been added to the open canvas, and the link should still say who they are.
  people: Person[]
}

// Renders a note as React elements built from the parsed tree — never from a
// string of HTML. There is no dangerouslySetInnerHTML here, which is what makes
// it safe for a note to contain angle brackets.
export function NotesView({ notes, people }: NotesViewProps) {
  const index = useMemo(() => new NameIndex(people), [people])
  const blocks = useMemo(() => parseNotes(notes), [notes])

  if (blocks.length === 0) {
    return <p className="text-13 text-muted-foreground">No notes yet.</p>
  }

  return (
    <div className="flex flex-col gap-2.5 text-13 leading-relaxed">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} index={index} />
      ))}
    </div>
  )
}

const HEADING_CLASS: Record<1 | 2 | 3, string> = {
  1: "font-heading text-sm font-semibold tracking-wide uppercase",
  2: "font-heading text-13 font-semibold tracking-wide uppercase",
  3: "font-heading text-11 font-semibold tracking-widest uppercase",
}

function BlockView({ block, index }: { block: Block; index: NameIndex }) {
  if (block.kind === "heading") {
    // One component rather than three, since the level is data. The tag is
    // picked from a fixed map, never built from the input.
    const Tag = (["h3", "h4", "h5"] as const)[block.level - 1]
    return (
      <Tag className={HEADING_CLASS[block.level]}>
        <InlineList nodes={block.children} index={index} />
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
            <InlineList nodes={item} index={index} />
          </li>
        ))}
      </Tag>
    )
  }

  return (
    <p>
      <InlineList nodes={block.children} index={index} />
    </p>
  )
}

function InlineList({ nodes, index }: { nodes: Inline[]; index: NameIndex }) {
  return (
    <>
      {nodes.map((node, i) => (
        <InlineView key={i} node={node} index={index} />
      ))}
    </>
  )
}

function InlineView({ node, index }: { node: Inline; index: NameIndex }) {
  const requestCenter = useCanvasUIStore((s) => s.requestCenter)

  switch (node.kind) {
    case "text":
      return <>{node.text}</>
    case "strong":
      return (
        <strong className="font-semibold">
          <InlineList nodes={node.children} index={index} />
        </strong>
      )
    case "em":
      return (
        <em className="italic">
          <InlineList nodes={node.children} index={index} />
        </em>
      )
    case "code":
      return (
        <code className="bg-muted px-1 py-0.5 font-mono text-11">
          {node.text}
        </code>
      )
    case "person": {
      const resolved = index.resolve(node.name)
      if (!resolved.ok) {
        // Shown, not hidden, and it says which kind of wrong it is. A link to a
        // name nobody has is usually a typo the reader can fix; one to a name
        // two people share needs them to decide which. Silently rendering
        // either as plain text would leave a note that looks fine and links to
        // nobody.
        return (
          <span
            className="border-b border-dotted border-muted-foreground text-muted-foreground"
            title={
              resolved.reason === "ambiguous"
                ? `More than one person is called “${node.name}”, so this link can't point at one of them.`
                : `No one in this file is called “${node.name}”.`
            }
          >
            {node.name}
          </span>
        )
      }
      return (
        <button
          type="button"
          className="cursor-pointer text-primary underline underline-offset-2"
          onClick={() => requestCenter(personNodeId(resolved.id))}
        >
          {node.name}
        </button>
      )
    }
  }
}
