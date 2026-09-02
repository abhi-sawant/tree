import { PersonForm, type PhotoAction } from "~/components/people/person-form"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { createPerson, updatePerson } from "~/lib/db/people"
import { addPersonToTree } from "~/lib/db/trees"
import { removePersonPhoto, setPersonPhoto } from "~/lib/photos"
import { personDisplayName } from "~/lib/person-name"
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
}

export function PersonFormDialog({
  open,
  onOpenChange,
  person,
  treeId,
}: PersonFormDialogProps) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {person ? `Edit ${personDisplayName(person)}` : "Add a person"}
          </DialogTitle>
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
