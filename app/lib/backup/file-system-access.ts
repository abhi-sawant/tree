// Only the slice of the File System Access API this app uses, declared here
// rather than taken from lib.dom.
//
// lib.dom carries FileSystemDirectoryHandle but neither showDirectoryPicker nor
// the queryPermission/requestPermission methods, and augmenting the global types
// to add them would claim the whole spec is available when it is Chromium-only.
// Structural interfaces also mean a test can hand these functions an ordinary
// object without casting.
export type HandlePermission = "granted" | "denied" | "prompt"

export interface HandlePermissionDescriptor {
  mode?: "read" | "readwrite"
}

export interface BackupWritable {
  write(data: Blob): Promise<void>
  close(): Promise<void>
}

export interface BackupFileHandle {
  readonly name: string
  createWritable(options?: {
    keepExistingData?: boolean
  }): Promise<BackupWritable>
}

export interface BackupDirectoryHandle {
  readonly kind: "directory"
  readonly name: string
  queryPermission(
    descriptor?: HandlePermissionDescriptor
  ): Promise<HandlePermission>
  requestPermission(
    descriptor?: HandlePermissionDescriptor
  ): Promise<HandlePermission>
  getFileHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<BackupFileHandle>
}

export type DirectoryPicker = (options?: {
  mode?: "read" | "readwrite"
  id?: string
  startIn?: string
}) => Promise<BackupDirectoryHandle>

interface WindowWithPicker {
  showDirectoryPicker?: DirectoryPicker
}

export function directoryPicker(): DirectoryPicker | undefined {
  if (typeof window === "undefined") return undefined
  const picker = (window as unknown as WindowWithPicker).showDirectoryPicker
  return typeof picker === "function" ? picker.bind(window) : undefined
}

// Firefox and Safari have neither the picker nor writable file handles, so on
// those browsers manual export stays the only answer and the UI has to say so
// rather than offering a button that can't work.
export function isFolderBackupSupported(): boolean {
  return directoryPicker() !== undefined
}
