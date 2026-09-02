import { useId } from "react"

import { PersonForm, type PhotoAction } from "~/components/people/person-form"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFormBar,
} from "~/components/ui/sheet"
import { createPerson, updatePerson } from "~/lib/db/people"
import { addPersonToTree } from "~/lib/db/trees"
import { removePersonPhoto, setPersonPhoto } from "~/lib/photos"
import { personDisplayName } from "~/lib/person-name"
import { useIsMobile } from "~/lib/ui/viewport-tier"
import type { PersonFormValues } from "~/lib/schemas"
import type { Person } from "~/lib/types"

interface PersonFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  person?: Person
  // When set, a newly created person joins this tree straight away — that's
  // what the shell's "+ Add person" means, as opposed to the People view's
  // pool-only add.
  treeId?: string
  // Seeds an empty form. Used where the reader has already typed the name
  // somewhere else — searching for someone who isn't recorded yet — so they
  // don't have to type it twice. Ignored when editing an existing person.
  prefill?: Partial<PersonFormValues>
}

export function PersonFormDialog({
  open,
  onOpenChange,
  person,
  treeId,
  prefill,
}: PersonFormDialogProps) {
  const isMobile = useIsMobile()
  // The sheet's Save button lives in the header bar, outside the form element.
  const formId = useId()

  async function handleSubmit(
    values: PersonFormValues,
    photoAction: PhotoAction
  ) {
    const saved = person
      ? await updatePerson(person.id, values)
      : await createPerson(values)
    if (photoAction.kind === "staged") {
      await setPersonPhoto(saved.id, photoAction.blob, photoAction.mime)
    } else if (photoAction.kind === "removed") {
      await removePersonPhoto(saved.id)
    }
    if (!person && treeId) await addPersonToTree(treeId, saved.id)
    onOpenChange(false)
  }

  const title = person ? `Edit ${personDisplayName(person)}` : "Add a person"
  const submitLabel = person ? "Save changes" : "Create"

  // A phone gets the whole screen. This form is thirteen fields plus a photo;
  // as a bottom sheet capped at 85dvh it would be a keyhole, and the Save
  // button would sit below the fold behind a soft keyboard. The `full` variant
  // has no drag handle on purpose — a half-typed person should not be thrown
  // away by a stray downward swipe.
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent variant="full">
          <SheetFormBar
            title={person ? personDisplayName(person) : "Add person"}
            onCancel={() => onOpenChange(false)}
            submitLabel={person ? "Save" : "Add"}
            submitProps={{ type: "submit", form: formId }}
          />
          <SheetBody className="pt-4">
            <PersonForm
              key={person?.id ?? "new"}
              formId={formId}
              hideActions
              initialValues={person ?? prefill}
              onSubmit={handleSubmit}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <PersonForm
          key={person?.id ?? "new"}
          initialValues={person ?? prefill}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          submitLabel={submitLabel}
        />
      </DialogContent>
    </Dialog>
  )
}
