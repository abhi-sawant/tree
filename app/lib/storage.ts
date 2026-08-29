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
