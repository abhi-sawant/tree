export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  // Deferred, not immediate: Chrome and Safari intermittently abort a download
  // whose blob URL is revoked before the transfer has actually started, which
  // gets much likelier now that a backup can be a large .zip.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
