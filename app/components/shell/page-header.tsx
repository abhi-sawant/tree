// The big title that opens each page on a wide screen. A phone has the
// MobileScreenHeader for this, so it is hidden there rather than doubled up.
export function PageHeader({
  title,
  detail,
  children,
}: {
  title: string
  detail?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3 max-md:hidden">
      <div className="flex min-w-0 flex-col">
        <h1 className="font-heading text-4xl leading-tight font-semibold tracking-tight">
          {title}
        </h1>
        {detail && (
          <p className="text-sm font-medium text-muted-foreground">{detail}</p>
        )}
      </div>
      {children && <div className="ml-auto">{children}</div>}
    </div>
  )
}
