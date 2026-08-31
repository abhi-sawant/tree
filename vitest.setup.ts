import "fake-indexeddb/auto"

// fake-indexeddb clones every value it stores (lib/cloneValueForInsertion.js)
// with the global structuredClone. Under vitest that's Node's, and a jsdom Blob
// is not Node's Blob — it's an ordinary object whose bytes hang off a symbol
// key. Node doesn't recognise it, doesn't throw, and silently degrades it to
// `{}`, so any Blob written to IndexedDB used to come back unreadable and the
// photo backup path couldn't be tested at all.
//
// Swap Blobs out for index sentinels around the native call and put the same
// instances back afterwards. Blobs are immutable, so sharing an instance
// between the original and the "clone" is safe. Everything else keeps native
// semantics, including DataCloneError on genuinely unclonable values.
const nativeStructuredClone = globalThis.structuredClone
const BLOB_REF = "__jsdomBlobRef__" // a string, not a symbol: symbol keys don't survive a clone

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

globalThis.structuredClone = ((
  value: unknown,
  options?: StructuredSerializeOptions
) => {
  const blobs: Blob[] = []

  const pack = (node: unknown): unknown => {
    if (node instanceof Blob) return { [BLOB_REF]: blobs.push(node) - 1 }
    if (Array.isArray(node)) return node.map(pack)
    if (isPlainObject(node)) {
      return Object.fromEntries(
        Object.entries(node).map(([key, child]) => [key, pack(child)])
      )
    }
    return node
  }

  const unpack = (node: unknown): unknown => {
    if (isPlainObject(node) && BLOB_REF in node) {
      return blobs[node[BLOB_REF] as number]
    }
    if (Array.isArray(node)) return node.map(unpack)
    if (isPlainObject(node)) {
      return Object.fromEntries(
        Object.entries(node).map(([key, child]) => [key, unpack(child)])
      )
    }
    return node
  }

  return unpack(nativeStructuredClone(pack(value), options))
}) as typeof structuredClone
