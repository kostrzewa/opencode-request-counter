import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

/**
 * Central, cross-process request counter backed by SQLite.
 *
 * Locking: every write is a single statement (or an IMMEDIATE transaction),
 * so SQLite's own file locks serialize writers from all opencode processes.
 * `busy_timeout` makes a contending process wait for the lock instead of
 * failing with SQLITE_BUSY. WAL mode lets readers (the sidebar widget) run
 * concurrently with a writer without blocking it.
 */
export class Store {
  readonly db: Database

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true })
    this.db = new Database(path, { create: true, strict: true })
    // busy_timeout first, so that even switching to WAL waits for other processes.
    this.db.exec("PRAGMA busy_timeout = 5000")
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec("PRAGMA synchronous = NORMAL")
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS counts (
        day      TEXT    NOT NULL,
        provider TEXT    NOT NULL,
        count    INTEGER NOT NULL,
        PRIMARY KEY (day, provider)
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS limits (
        provider TEXT PRIMARY KEY,
        max      INTEGER NOT NULL
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) WITHOUT ROWID;
    `)
  }

  /** Atomically add one request for `provider` on `day`; returns the new count. */
  increment(day: string, provider: string): number {
    const row = this.db
      .query<{ count: number }, [string, string]>(
        `INSERT INTO counts (day, provider, count) VALUES (?, ?, 1)
         ON CONFLICT (day, provider) DO UPDATE SET count = count + 1
         RETURNING count`,
      )
      .get(day, provider)
    return row?.count ?? 0
  }

  counts(day: string): Record<string, number> {
    const rows = this.db
      .query<{ provider: string; count: number }, [string]>(`SELECT provider, count FROM counts WHERE day = ?`)
      .all(day)
    return Object.fromEntries(rows.map((r) => [r.provider, r.count]))
  }

  /** Replace the configured limits (last opencode instance to start wins). */
  setLimits(limits: Record<string, number>): void {
    this.db
      .transaction(() => {
        this.db.run(`DELETE FROM limits`)
        const insert = this.db.prepare(`INSERT INTO limits (provider, max) VALUES (?, ?)`)
        for (const [provider, max] of Object.entries(limits)) insert.run(provider, max)
      })
      .immediate()
  }

  limits(): Record<string, number> {
    const rows = this.db.query<{ provider: string; max: number }, []>(`SELECT provider, max FROM limits`).all()
    return Object.fromEntries(rows.map((r) => [r.provider, r.max]))
  }

  setMeta(values: Record<string, string>): void {
    this.db
      .transaction(() => {
        const upsert = this.db.prepare(
          `INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        )
        for (const [key, value] of Object.entries(values)) upsert.run(key, value)
      })
      .immediate()
  }

  meta(): Record<string, string> {
    const rows = this.db.query<{ key: string; value: string }, []>(`SELECT key, value FROM meta`).all()
    return Object.fromEntries(rows.map((r) => [r.key, r.value]))
  }

  /** Delete counts for days before `day` (YYYY-MM-DD sorts lexicographically). */
  prune(beforeDay: string): number {
    return this.db.run(`DELETE FROM counts WHERE day < ?`, [beforeDay]).changes
  }

  close(): void {
    this.db.close()
  }
}
