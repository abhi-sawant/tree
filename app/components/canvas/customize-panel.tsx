import { useMemo, type ReactNode } from "react"

import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
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
            <SectionHeading>Relationship colors</SectionHeading>
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
            <SectionHeading>Generation colors</SectionHeading>
            <div className="flex flex-wrap gap-4">
              {settings.generationColors.map((color, i) => (
                <ColorField
                  key={i}
                  label={`Gen ${i + 1}`}
                  value={color ?? defaultGenerationHex[i]}
                  onChange={(next) => setGenerationColor(i, next)}
                  onReset={() => setGenerationColor(i, null)}
                  resettable={color !== null}
                />
              ))}
            </div>
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

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-heading text-xs font-semibold tracking-widest uppercase">
      {children}
    </h3>
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
        className="h-8 w-12 cursor-pointer border border-border bg-transparent p-0.5"
        aria-label={label}
      />
      <span className="text-11 text-muted-foreground">{label}</span>
      {resettable && (
        <button
          type="button"
          className="text-9-5 text-muted-foreground underline hover:text-foreground"
          onClick={onReset}
        >
          Reset
        </button>
      )}
    </div>
  )
}
