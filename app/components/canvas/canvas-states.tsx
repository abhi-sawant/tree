import { Button } from "~/components/ui/button"

interface CanvasMessageProps {
  title: string
  description?: string
  action?: React.ReactNode
}

function CanvasMessage({ title, description, action }: CanvasMessageProps) {
  return (
    <div className="flex h-full w-full flex-1 flex-col items-center justify-center gap-1.5 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  )
}

export function CanvasLoadingState({
  label = "Loading tree…",
}: {
  label?: string
}) {
  return <CanvasMessage title={label} />
}

export function TreeNotFoundState() {
  return (
    <CanvasMessage
      title="Tree not found"
      description="This tree doesn't exist or may have been deleted."
    />
  )
}

export function EmptyTreeState({
  treeName,
  onAddPerson,
}: {
  treeName: string
  onAddPerson?: () => void
}) {
  return (
    <CanvasMessage
      title={`"${treeName}" has no members yet`}
      description="Add a person to start this tree."
      action={
        onAddPerson && <Button onClick={onAddPerson}>+ Add person</Button>
      }
    />
  )
}
