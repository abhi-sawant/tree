import type { DBCore, DBCoreTable, Middleware } from "dexie"

// Tables that hold bookkeeping *about* the data rather than the data itself.
// Writing a snapshot or a last-export date must not itself look like a change,
// or the snapshot scheduler would feed itself for ever.
export const BOOKKEEPING_TABLES: readonly string[] = [
  "appMeta",
  "snapshots",
  "backupTargets",
]

export type ChangeListener = (tables: readonly string[]) => void

const listeners = new Set<ChangeListener>()

// Registered once per concern from the app root. Returns its own unsubscribe so
// a React effect can clean up without the module tracking who subscribed.
export function onDataChange(listener: ChangeListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function notifyDataChange(tables: readonly string[]): void {
  if (tables.length === 0) return
  for (const listener of [...listeners]) {
    try {
      listener(tables)
    } catch {
      // A listener that throws is a bug in the listener. Letting it propagate
      // would reject the write it was notified about, turning a broken nudge
      // banner into lost data — the exact failure this phase exists to stop.
    }
  }
}

export function clearDataChangeListeners(): void {
  listeners.clear()
}

// Every mutation in the app is meant to go through the helpers in lib/db/*, but
// "meant to" is not a guarantee, and a durability feature that misses writes is
// worse than none. Dexie's DBCore middleware is the one place every write
// genuinely passes through — including a stray db.* call from UI code, and
// including Dexie's own bulk paths.
//
// Fires *after* the low-level operation resolves but before the surrounding
// transaction commits, so a transaction that later aborts will have signalled a
// change that never landed. That asymmetry is the safe one: a spurious signal
// costs a redundant snapshot of unchanged data, a missed one costs the change.
//
// One signal per operation, not per transaction — a bulk write of fifty rows
// fires fifty times. Consumers debounce (see lib/backup/schedule.ts) rather than
// this module guessing at a batching window.
export function dataChangeMiddleware(
  ignoredTables: readonly string[] = BOOKKEEPING_TABLES
): Middleware<DBCore> {
  const ignored = new Set(ignoredTables)

  return {
    stack: "dbcore",
    name: "familyTreeChangeSignal",
    create: (downlevel) => ({
      ...downlevel,
      table: (tableName: string): DBCoreTable => {
        const table = downlevel.table(tableName)
        if (ignored.has(tableName)) return table
        return {
          ...table,
          mutate: (request) =>
            table.mutate(request).then((response) => {
              notifyDataChange([tableName])
              return response
            }),
        }
      },
    }),
  }
}
