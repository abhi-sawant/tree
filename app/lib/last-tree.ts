// UI convenience only — not exported/backed-up data, so plain localStorage is
// fine (no Dexie table, no JSON schema entry).
const LAST_TREE_KEY = "familytree:lastTreeId"

export function getLastTreeId(): string | undefined {
  return localStorage.getItem(LAST_TREE_KEY) ?? undefined
}

export function setLastTreeId(id: string): void {
  localStorage.setItem(LAST_TREE_KEY, id)
}
