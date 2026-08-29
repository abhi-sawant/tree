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
