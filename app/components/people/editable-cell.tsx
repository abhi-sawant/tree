import { useState } from "react"

import { updatePerson } from "~/lib/db/people"
import {
  applyInlineEdit,
  inlineDisplayValue,
  inlineEditValue,
  isNoOpEdit,
  type InlineField,
} from "~/lib/people/inline-edit"
import { toast } from "~/lib/ui/toast-store"
import { cn } from "~/lib/utils"
import type { Person } from "~/lib/types"

interface EditableCellProps {
  person: Person
  field: InlineField
  placeholder?: string
  // Moves to the next editable cell in the row on Tab, so a row can be filled
  // in without reaching for the mouse.
  onTabToNext?: () => void
  editing: boolean
  onEditingChange: (editing: boolean) => void
}

export function EditableCell({
  person,
  field,
  placeholder = "—",
  onTabToNext,
  editing,
  onEditingChange,
}: EditableCellProps) {
  if (editing) {
    return (
      <CellEditor
        person={person}
        field={field}
        onTabToNext={onTabToNext}
        onDone={() => onEditingChange(false)}
      />
    )
  }

  const display = inlineDisplayValue(person, field)
  return (
    <button
      type="button"
      // A cell you can edit has to look like one before it is clicked, or
      // nobody finds it. The hover background is the whole affordance.
      className="-mx-1 w-full cursor-text rounded-xs px-1 py-0.5 text-left hover:bg-muted"
      onClick={() => onEditingChange(true)}
      aria-label={`Edit ${field} for ${person.givenName}`}
    >
      <span className={cn(!display && "text-muted-foreground")}>
        {display || placeholder}
      </span>
    </button>
  )
}

// Mounted only while the cell is being edited, which is what makes this
// correct: the draft is seeded once from the person at mount, and autoFocus
// takes the cursor synchronously as the input appears. An input that lived
// across the not-editing state instead had to reset its draft in an effect and
// focus on the next frame — a gap in which the first keystrokes went nowhere.
function CellEditor({
  person,
  field,
  onTabToNext,
  onDone,
}: {
  person: Person
  field: InlineField
  onTabToNext?: () => void
  onDone: () => void
}) {
  const [draft, setDraft] = useState(() => inlineEditValue(person, field))
  // Enter and Tab commit and then blur, and the blur must not commit a second
  // time — nor cancel over the top of a commit that is still in flight.
  const [settled, setSettled] = useState(false)

  async function commit(then?: () => void) {
    if (settled) return
    setSettled(true)

    if (isNoOpEdit(person, field, draft)) {
      onDone()
      then?.()
      return
    }

    const result = applyInlineEdit(person, field, draft)
    if (!result.ok) {
      toast(result.message)
      // Left open with the offending value still in it, so the correction is a
      // keystroke away rather than a re-click and a retype.
      setSettled(false)
      return
    }

    try {
      await updatePerson(person.id, result.patch)
      onDone()
      then?.()
    } catch {
      toast("Couldn't save that change.")
      setSettled(false)
    }
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      // Selecting on focus means typing replaces the value, which is what you
      // want when correcting a whole name rather than appending to it.
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          void commit()
        } else if (e.key === "Escape") {
          e.preventDefault()
          setSettled(true)
          onDone()
        } else if (e.key === "Tab" && onTabToNext) {
          e.preventDefault()
          void commit(onTabToNext)
        }
      }}
      className="-mx-1 w-full min-w-0 rounded-xs border border-primary bg-background px-1 py-0.5 text-13 outline-none"
    />
  )
}
