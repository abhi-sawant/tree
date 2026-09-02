import { useMemo } from "react"

import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Select } from "~/components/ui/select"
import { SectionHeading } from "~/components/ui/section-heading"
import { COLOR_BY_OPTIONS, type ColorBy } from "~/lib/canvas/color-groups"
import { EDGE_ROUTINGS, type EdgeRouting } from "~/lib/canvas/edge-routing"
import {
  directionLabel,
  type LayoutDirection,
} from "~/lib/canvas/layout-direction"
import { getCssVariableHex } from "~/lib/canvas/appearance-resolve"
import {
  GENERATION_LEVELS,
  useAppearanceStore,
  type AppearanceSettings,
} from "~/lib/canvas/appearance-store"

interface CustomizePanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type NumericSettingKey = {
  [K in keyof AppearanceSettings]: AppearanceSettings[K] extends number
    ? K
    : never
}[keyof AppearanceSettings]

const NUMERIC_FIELDS: Array<{
  key: NumericSettingKey
  label: string
  min: number
}> = [
  { key: "personWidth", label: "Card width", min: 120 },
  { key: "personHeight", label: "Card height", min: 80 },
  { key: "avatarSize", label: "Avatar size", min: 24 },
  { key: "edgeStrokeWidth", label: "Connector width", min: 1 },
  { key: "horizontalSpacing", label: "Horizontal spacing", min: 0 },
  { key: "verticalSpacing", label: "Vertical spacing", min: 0 },
]

export function CustomizePanel({ open, onOpenChange }: CustomizePanelProps) {
  const settings = useAppearanceStore((s) => s.settings)
  const setSetting = useAppearanceStore((s) => s.setSetting)
  const setGenerationColor = useAppearanceStore((s) => s.setGenerationColor)
  const resetToDefaults = useAppearanceStore((s) => s.resetToDefaults)

  // Recomputed each time the dialog opens so a theme switch (light/dark) is
  // reflected in the swatches shown for not-yet-customized colors.
  const defaultSpouseHex = useMemo(
    () => getCssVariableHex("--edge-spouse"),
    [open]
  )
  const defaultParentChildHex = useMemo(
    () => getCssVariableHex("--edge-parent-child"),
    [open]
  )
  const defaultGenerationHex = useMemo(
    () =>
      Array.from({ length: GENERATION_LEVELS }, (_, i) =>
        getCssVariableHex(`--level-${i}`)
      ),
    [open]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Customize appearance</DialogTitle>
          <DialogDescription>
            Changes apply immediately and are saved in this browser.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-6 overflow-y-auto pr-1">
          <section className="flex flex-col gap-2.5">
            <SectionHeading as="h3">Layout</SectionHeading>
            <Label className="max-w-56 flex-col items-start gap-1.5 text-sm font-normal normal-case">
              Direction
              <Select
                value={settings.layoutDirection}
                onChange={(e) =>
                  setSetting(
                    "layoutDirection",
                    e.target.value as LayoutDirection
                  )
                }
              >
                {(["DOWN", "RIGHT"] as const).map((direction) => (
                  <option key={direction} value={direction}>
                    {directionLabel(direction)}
                  </option>
                ))}
              </Select>
            </Label>
            <Label className="max-w-56 flex-col items-start gap-1.5 text-sm font-normal normal-case">
              Connector shape
              <Select
                value={settings.edgeRouting}
                onChange={(e) =>
                  setSetting("edgeRouting", e.target.value as EdgeRouting)
                }
              >
                {EDGE_ROUTINGS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Label>
            <p className="text-11 leading-relaxed text-muted-foreground">
              Left to right suits wide, shallow trees. Cards you have pinned by
              hand keep their saved position in either direction — use Re-layout
              to release them. Connector shape applies to parent–child lines; a
              marriage line is always drawn straight across between the couple.
            </p>
          </section>

          <section className="flex flex-col gap-2.5">
            <SectionHeading as="h3">What each card shows</SectionHeading>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Label className="text-sm font-normal normal-case">
                <Checkbox
                  checked={settings.showPhoto}
                  onCheckedChange={(checked) =>
                    setSetting("showPhoto", checked === true)
                  }
                />
                Photo
              </Label>
              <Label className="text-sm font-normal normal-case">
                <Checkbox
                  checked={settings.showDates}
                  onCheckedChange={(checked) =>
                    setSetting("showDates", checked === true)
                  }
                />
                Dates
              </Label>
            </div>
            <p className="text-11 leading-relaxed text-muted-foreground">
              Turning both off leaves a name-only card, which fits far more of a
              large tree on screen — shrink the card size below to take
              advantage of it.
            </p>
          </section>

          <section className="grid grid-cols-2 gap-x-4 gap-y-3">
            {NUMERIC_FIELDS.map(({ key, label, min }) => (
              <Label
                key={key}
                className="flex-col items-start gap-1.5 text-sm font-normal normal-case"
              >
                {label}
                <Input
                  type="number"
                  min={min}
                  value={settings[key]}
                  onChange={(e) => {
                    const value = Number(e.target.value)
                    if (Number.isFinite(value)) {
                      setSetting(key, Math.max(min, value))
                    }
                  }}
                />
              </Label>
            ))}
          </section>

          <section className="flex flex-col gap-2.5">
            <SectionHeading as="h3">Relationship colors</SectionHeading>
            <div className="flex flex-wrap gap-4">
              <ColorField
                label="Marriage"
                value={settings.spouseColor ?? defaultSpouseHex}
                onChange={(color) => setSetting("spouseColor", color)}
                onReset={() => setSetting("spouseColor", null)}
                resettable={settings.spouseColor !== null}
              />
              <ColorField
                label="Parent–child"
                value={settings.parentChildColor ?? defaultParentChildHex}
                onChange={(color) => setSetting("parentChildColor", color)}
                onReset={() => setSetting("parentChildColor", null)}
                resettable={settings.parentChildColor !== null}
              />
            </div>
          </section>

          <section className="flex flex-col gap-2.5">
            <SectionHeading as="h3">Card colors</SectionHeading>
            <Label className="max-w-56 flex-col items-start gap-1.5 text-sm font-normal normal-case">
              Group cards by
              <Select
                value={settings.colorBy}
                onChange={(e) =>
                  setSetting("colorBy", e.target.value as ColorBy)
                }
              >
                {COLOR_BY_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Label>
            <div className="flex flex-wrap gap-4">
              {settings.generationColors.map((color, i) => (
                <ColorField
                  key={i}
                  label={`Group ${i + 1}`}
                  value={color ?? defaultGenerationHex[i]}
                  onChange={(next) => setGenerationColor(i, next)}
                  onReset={() => setGenerationColor(i, null)}
                  resettable={color !== null}
                />
              ))}
            </div>
            <p className="text-11 leading-relaxed text-muted-foreground">
              These colours are used for whichever grouping is chosen. By branch
              they mark the lines descending from each of the root person&apos;s
              children; by surname the commonest surname takes the first colour.
            </p>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetToDefaults}>
            Reset all to defaults
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ColorField({
  label,
  value,
  onChange,
  onReset,
  resettable,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onReset: () => void
  resettable: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-12 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
        aria-label={label}
      />
      <span className="text-11 text-muted-foreground">{label}</span>
      {resettable && (
        <Button
          type="button"
          variant="link"
          size="xs"
          className="h-auto p-0 text-9-5 tracking-normal normal-case"
          onClick={onReset}
        >
          Reset
        </Button>
      )}
    </div>
  )
}
