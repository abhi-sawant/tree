import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"
import * as React from "react"

import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

// The mobile counterpart to ui/dialog.tsx, on Base UI's Drawer rather than its
// Dialog because the three things this has to do — rest at a peek height and
// expand on a drag, dismiss on a swipe down, and stay open over a canvas the
// finger can still pan — are all gesture behaviour, and none of them can be had
// from a repositioned dialog. Nothing new was installed for it (ADR D1/D18):
// @base-ui/react has shipped Drawer since 1.7.
//
// Most dialogs in the app do NOT need this. ui/dialog.tsx restyles itself as a
// bottom sheet below `md` with class variants alone; reach for Sheet only when
// the surface genuinely wants a handle, a snap point, or a live background.
//
// The transition timings and the data-starting/ending-style transforms below
// come from Base UI's own bottom-sheet and snap-point demos, retokenised onto
// this app's palette. They are load-bearing: without the paired
// starting/ending transform the sheet appears and disappears instantly.
const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]"

function Sheet({ ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetBackdrop({
  className,
  ...props
}: DrawerPrimitive.Backdrop.Props) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="sheet-backdrop"
      className={cn(
        "fixed inset-0 z-100 min-h-dvh bg-black/25 dark:bg-black/50",
        // Fades out under the finger as the sheet is dragged away, which is
        // what makes a half-completed swipe feel reversible rather than modal.
        "opacity-[calc(1-var(--drawer-swipe-progress))]",
        `transition-opacity duration-[450ms] ${EASE} data-swiping:duration-0`,
        "data-ending-style:opacity-0 data-starting-style:opacity-0",
        "data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)]",
        // iOS 26+: the visible viewport moves under a fixed backdrop.
        "supports-[-webkit-touch-callout:none]:absolute",
        "motion-reduce:transition-none",
        className
      )}
      {...props}
    />
  )
}

type SheetVariant = "bottom" | "snap" | "full"

// Shared by all three variants. `overflow-hidden` matters: the body scrolls,
// the popup does not, or a snap point would be measured against the content
// height rather than the snap offset.
const POPUP_BASE =
  "relative z-1 flex w-full min-h-0 flex-col bg-popover text-popover-foreground outline-none border-border-strong shadow-float"

const POPUP_VARIANT: Record<SheetVariant, string> = {
  bottom: cn(
    "max-h-[85dvh] max-w-[42rem] overflow-hidden rounded-t-2xl border border-b-0",
    "[transform:translateY(var(--drawer-swipe-movement-y))]",
    `transition-transform duration-[450ms] ${EASE} data-swiping:select-none`,
    "data-starting-style:[transform:translateY(calc(100%+2px))]",
    "data-ending-style:[transform:translateY(calc(100%+2px))]",
    "data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)]",
    "motion-reduce:transition-none"
  ),
  // The snap variant carries the snap offset in BOTH the transform and the
  // bottom padding — the transform slides the sheet down to its resting point,
  // the padding backfills the gap that would otherwise show the page behind it.
  snap: cn(
    "max-h-[calc(100dvh-1rem)] max-w-[42rem] touch-none overflow-hidden rounded-t-2xl border border-b-0",
    "[padding-bottom:max(0px,calc(var(--drawer-snap-point-offset)+var(--drawer-swipe-movement-y)))]",
    "[transform:translateY(calc(var(--drawer-snap-point-offset)+var(--drawer-swipe-movement-y)))]",
    `transition-transform duration-[450ms] ${EASE} data-swiping:select-none`,
    "data-starting-style:[transform:translateY(calc(100%+2px))] data-starting-style:[padding-bottom:0]",
    "data-ending-style:[transform:translateY(calc(100%+2px))] data-ending-style:[padding-bottom:0]",
    "data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)]",
    "motion-reduce:transition-none"
  ),
  // A form that fills the screen: no radius, no handle, no swipe-away. Its
  // header owns Cancel, so dismissing it is a deliberate act — a half-typed
  // person should not vanish because a thumb brushed downwards.
  full: cn(
    "h-dvh max-h-dvh overflow-hidden",
    "[transform:translateY(var(--drawer-swipe-movement-y))]",
    `transition-transform duration-[450ms] ${EASE}`,
    "data-starting-style:[transform:translateY(calc(100%+2px))]",
    "data-ending-style:[transform:translateY(calc(100%+2px))]",
    "motion-reduce:transition-none"
  ),
}

function SheetContent({
  className,
  variant = "bottom",
  children,
  ...props
}: DrawerPrimitive.Popup.Props & { variant?: SheetVariant }) {
  return (
    // The keyboard provider has to sit inside Drawer.Root and outside the
    // portal — it reads the root's context, and it is what publishes
    // --drawer-keyboard-inset so a focused field stays above a soft keyboard.
    // Applied to every sheet rather than only the form ones: a drawer with no
    // form controls is unaffected by it, and remembering to opt in is exactly
    // the kind of thing that gets forgotten on the one sheet that needed it.
    <DrawerPrimitive.VirtualKeyboardProvider>
      <DrawerPrimitive.Portal>
        <SheetBackdrop />
        <DrawerPrimitive.Viewport
          className={cn(
            "fixed inset-0 z-100 flex items-end justify-center",
            variant === "snap" && "touch-none"
          )}
        >
          <DrawerPrimitive.Popup
            data-slot="sheet-content"
            data-variant={variant}
            className={cn(POPUP_BASE, POPUP_VARIANT[variant], className)}
            {...props}
          >
            {children}
          </DrawerPrimitive.Popup>
        </DrawerPrimitive.Viewport>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.VirtualKeyboardProvider>
  )
}

// The drag surface. `touch-none` here and `touch-auto` on the body is the whole
// of the gesture split: a drag that starts on the header moves the sheet, a
// drag that starts on the content scrolls it.
function SheetHeader({
  className,
  showHandle = true,
  children,
  ...props
}: React.ComponentProps<"div"> & { showHandle?: boolean }) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "flex flex-none touch-none flex-col gap-2.5 px-4 pt-2.5 pb-3 select-none",
        className
      )}
      {...props}
    >
      {showHandle && <SheetHandle />}
      {children}
    </div>
  )
}

function SheetHandle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-handle"
      aria-hidden
      className={cn(
        "mx-auto h-1 w-9 flex-none rounded-full bg-border-strong",
        className
      )}
      {...props}
    />
  )
}

function SheetBody({ className, ...props }: DrawerPrimitive.Content.Props) {
  return (
    <DrawerPrimitive.Content
      data-slot="sheet-body"
      className={cn(
        "min-h-0 flex-1 touch-auto overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]",
        className
      )}
      {...props}
    />
  )
}

// A row in an action sheet. Its own component because five sheets need the
// same thing — a 48px tap target, an optional icon, a label with an optional
// second line, an optional trailing indicator — and five hand-rolled versions
// would disagree about the height within a week.
function SheetItem({
  icon,
  label,
  detail,
  trailing,
  destructive,
  selected,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  icon?: React.ReactNode
  label: React.ReactNode
  detail?: React.ReactNode
  trailing?: React.ReactNode
  destructive?: boolean
  selected?: boolean
}) {
  return (
    <button
      type="button"
      data-slot="sheet-item"
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex min-h-13 w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-2.5 text-left disabled:pointer-events-none disabled:opacity-50",
        selected ? "bg-primary/10" : "hover:bg-muted",
        destructive && "text-destructive",
        className
      )}
      {...props}
    >
      {icon && (
        <span
          className={cn(
            "flex-none",
            destructive ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {icon}
        </span>
      )}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-15 font-medium">{label}</span>
        {detail && (
          <span className="text-12-5 text-muted-foreground">{detail}</span>
        )}
      </span>
      {trailing && (
        <span className="ml-auto flex flex-none items-center gap-2 text-12-5 text-muted-foreground">
          {trailing}
        </span>
      )}
    </button>
  )
}

function SheetTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-heading text-base font-semibold", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-13 leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "flex flex-none flex-col gap-2 border-t border-border px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]",
        className
      )}
      {...props}
    />
  )
}

// The full-screen form's header: Cancel on the left, the title centred, the
// commit action on the right. iOS's own shape, and the one the design catalog
// draws — the title has to stay centred whatever the two labels measure, which
// is why the sides are equal-basis flex items rather than an auto margin.
function SheetFormBar({
  title,
  onCancel,
  cancelLabel = "Cancel",
  submitLabel,
  onSubmit,
  submitDisabled,
  submitProps,
  className,
}: {
  title: React.ReactNode
  onCancel: () => void
  cancelLabel?: string
  submitLabel: string
  onSubmit?: () => void
  submitDisabled?: boolean
  // For a bar whose commit action submits a form it isn't inside: pass
  // `{ type: "submit", form: id }`. HTML associates the two by id across any
  // DOM distance, including the sheet's portal.
  submitProps?: Partial<React.ComponentProps<typeof Button>>
  className?: string
}) {
  return (
    <div
      data-slot="sheet-form-bar"
      className={cn(
        "flex h-14 flex-none touch-none items-center gap-2 border-b border-border px-2",
        className
      )}
    >
      <div className="flex flex-1 basis-0 justify-start">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
      <SheetTitle className="truncate text-center text-15">{title}</SheetTitle>
      <div className="flex flex-1 basis-0 justify-end">
        <Button
          size="sm"
          disabled={submitDisabled}
          onClick={onSubmit}
          {...submitProps}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}

export {
  Sheet,
  SheetBackdrop,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetFormBar,
  SheetHandle,
  SheetHeader,
  SheetItem,
  SheetTitle,
  SheetTrigger,
}
