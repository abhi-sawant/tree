function storageManager(): StorageManager | undefined {
  return typeof navigator !== "undefined" ? navigator.storage : undefined
}

export function isStorageApiSupported(): boolean {
  return !!storageManager()?.persist
}

export async function isStoragePersisted(): Promise<boolean> {
  const storage = storageManager()
  if (!storage?.persisted) return false
  try {
    return await storage.persisted()
  } catch {
    return false
  }
}

export async function requestPersistentStorage(): Promise<boolean> {
  const storage = storageManager()
  if (!storage?.persist) return false
  try {
    if (await isStoragePersisted()) return true
    return await storage.persist()
  } catch {
    return false
  }
}

export interface StorageUsage {
  usage: number
  quota: number
}

// Deliberately returns the browser's own numbers untouched. They cover the
// whole origin — IndexedDB, the service worker's precache, localStorage — not
// just this database, and Chrome pads the quota on purpose so a site can't
// fingerprint the disk. Anything presenting these has to say so rather than
// implying they are an exact measurement of the family data.
export async function estimateStorage(): Promise<StorageUsage | undefined> {
  const storage = storageManager()
  if (!storage?.estimate) return undefined
  try {
    const { usage, quota } = await storage.estimate()
    // A quota of 0 is not a real answer, and dividing by it would report a
    // full disk. usage === 0 is legitimate, so only quota is checked.
    if (typeof quota !== "number" || quota <= 0) return undefined
    return { usage: typeof usage === "number" ? usage : 0, quota }
  } catch {
    return undefined
  }
}
