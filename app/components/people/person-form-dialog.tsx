import { PersonForm, type PhotoAction } from "~/components/people/person-form"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { createPerson, updatePerson } from "~/lib/db/people"
import { removePersonPhoto, setPersonPhoto } from "~/lib/photos"
import type { PersonFormValues } from "~/lib/schemas"
import type { Person } from "~/lib/types"

interface PersonFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  person?: Person
}

export function PersonFormDialog({ open, onOpenChange, person }: PersonFormDialogProps) {
  async function handleSubmit(values: PersonFormValues, photoAction: PhotoAction) {
    const saved = person ? await updatePerson(person.id, values) : await createPerson(values)
    if (photoAction.kind === "staged") {
      await setPersonPhoto(saved.id, photoAction.blob, photoAction.mime)
    } else if (photoAction.kind === "removed") {
      await removePersonPhoto(saved.id)
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{person ? "Edit person" : "Add person"}</DialogTitle>
        </DialogHeader>
        <PersonForm
          key={person?.id ?? "new"}
          initialValues={person}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          submitLabel={person ? "Save changes" : "Create"}
        />
      </DialogContent>
    </Dialog>
  )
}
