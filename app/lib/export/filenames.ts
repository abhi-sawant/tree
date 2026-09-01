export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "family-tree"
}

export function exportFilename(
  treeName: string,
  extension: "png" | "svg" | "pdf"
): string {
  const date = new Date().toISOString().slice(0, 10)
  return `${slugify(treeName)}-${date}.${extension}`
}

// GEDCOM export always covers the entire global pool (D14), never a single
// tree, so unlike exportFilename this has no tree name to slugify.
export function gedcomFilename(date: Date = new Date()): string {
  return `family-tree-${date.toISOString().slice(0, 10)}.ged`
}

// The native backup is a .zip (manifest + raw photo bytes), not the .json it
// used to be. Same whole-pool scope as gedcomFilename, so no tree name either.
export function backupFilename(date: Date = new Date()): string {
  return `family-tree-backup-${date.toISOString().slice(0, 10)}.zip`
}

// Distinct stem from backupFilename so the two .zip exports can't be confused
// for one another once they're sitting side by side in a downloads folder.
export function gedcomZipFilename(date: Date = new Date()): string {
  return `family-tree-gedcom-${date.toISOString().slice(0, 10)}.zip`
}

// Same whole-pool scope as the GEDCOM and backup exports, so again no tree name.
export function anniversariesIcsFilename(date: Date = new Date()): string {
  return `family-tree-anniversaries-${date.toISOString().slice(0, 10)}.ics`
}

// The one export scoped to a single tree rather than the whole pool, so unlike
// the others it carries the tree's name — a book of the Sawants and a book of
// the Iyers sitting in the same folder have to be tellable apart.
export function familyBookFilename(
  treeName: string,
  date: Date = new Date()
): string {
  return `${slugify(treeName)}-family-book-${date.toISOString().slice(0, 10)}.pdf`
}

// The spreadsheet view of the pool. Same whole-pool scope as the others, and a
// distinct stem so it can't be mistaken for the GEDCOM or the backup.
export function peopleCsvFilename(date: Date = new Date()): string {
  return `family-tree-people-${date.toISOString().slice(0, 10)}.csv`
}
