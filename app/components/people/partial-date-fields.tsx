import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import type { PartialDate } from "~/lib/types"

interface PartialDateFieldsProps {
  legend: string
  value?: PartialDate
  onChange: (value: PartialDate | undefined) => void
}

function toUndefinedIfEmpty(pd: PartialDate): PartialDate | undefined {
  return pd.year === undefined && pd.month === undefined && pd.day === undefined
    ? undefined
    : pd
}

export function PartialDateFields({ legend, value, onChange }: PartialDateFieldsProps) {
  const current: PartialDate = value ?? {}

  function update(patch: Partial<PartialDate>) {
    onChange(toUndefinedIfEmpty({ ...current, ...patch }))
  }

  function parseNumberInput(raw: string): number | undefined {
    if (raw === "") return undefined
    const parsed = Number(raw)
    return Number.isNaN(parsed) ? undefined : parsed
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-xs font-semibold tracking-wide uppercase">{legend}</legend>
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${legend}-year`}>Year</Label>
          <Input
            id={`${legend}-year`}
            type="number"
            inputMode="numeric"
            className="w-20"
            value={current.year ?? ""}
            onChange={(e) => update({ year: parseNumberInput(e.target.value) })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${legend}-month`}>Month</Label>
          <Input
            id={`${legend}-month`}
            type="number"
            inputMode="numeric"
            min={1}
            max={12}
            className="w-16"
            value={current.month ?? ""}
            onChange={(e) => update({ month: parseNumberInput(e.target.value) })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${legend}-day`}>Day</Label>
          <Input
            id={`${legend}-day`}
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            className="w-16"
            value={current.day ?? ""}
            onChange={(e) => update({ day: parseNumberInput(e.target.value) })}
          />
        </div>
        <Label className="mb-2.5">
          <Checkbox
            checked={current.approximate ?? false}
            onCheckedChange={(checked) => update({ approximate: checked === true })}
          />
          Approximate
        </Label>
      </div>
    </fieldset>
  )
}
