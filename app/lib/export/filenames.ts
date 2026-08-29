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
