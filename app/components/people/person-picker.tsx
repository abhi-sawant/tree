import { useState } from "react"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "~/components/ui/combobox"
import { useSearchPeople } from "~/lib/db/hooks"
import { formatPartialDate } from "~/lib/partial-date"
import type { Person } from "~/lib/types"
import { personDisplayName } from "~/lib/person-name"

interface PersonPickerOption {
  value: string
  label: string
}

interface PersonPickerProps {
  onSelect: (person: Person) => void
  excludeIds?: string[]
  includePlaceholders?: boolean
  placeholder?: string
}

function toLabel(person: Person): string {
  const name = personDisplayName(person)
  const birth = formatPartialDate(person.birth)
  return birth ? `${name} (b. ${birth})` : name
}

export function PersonPicker({
  onSelect,
  excludeIds = [],
  includePlaceholders = true,
  placeholder = "Search for a person…",
}: PersonPickerProps) {
  const [query, setQuery] = useState("")
  const results = useSearchPeople(query, { includePlaceholders })
  const excludeSet = new Set(excludeIds)
  const candidates = (results ?? []).filter(
    (person) => !excludeSet.has(person.id)
  )

  const items: PersonPickerOption[] = candidates.map((person) => ({
    value: person.id,
    label: toLabel(person),
  }))

  function handleValueChange(value: PersonPickerOption | null) {
    if (!value) return
    const person = candidates.find((p) => p.id === value.value)
    if (person) onSelect(person)
  }

  return (
    <Combobox
      items={items}
      inputValue={query}
      onInputValueChange={setQuery}
      onValueChange={handleValueChange}
    >
      <ComboboxInput placeholder={placeholder} />
      <ComboboxContent>
        <ComboboxEmpty>No matching people.</ComboboxEmpty>
        <ComboboxList>
          {(item: PersonPickerOption) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
