interface CanvasMessageProps {
  title: string
  description?: string
}

function CanvasMessage({ title, description }: CanvasMessageProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}

export function CanvasLoadingState({ label = "Loading tree…" }: { label?: string }) {
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

export function EmptyTreeState({ treeName }: { treeName: string }) {
  return (
    <CanvasMessage
      title={`"${treeName}" has no members yet`}
      description="Add people to this tree from the People page."
    />
  )
}
