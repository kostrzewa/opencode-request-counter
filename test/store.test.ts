import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Store } from "../src/store.ts"

let dir: string
let dbPath: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "request-counter-"))
  dbPath = join(dir, "nested", "counter.db")
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

test("increment creates the directory and counts per day and provider", () => {
  const store = new Store(dbPath)
  expect(store.increment("2026-11-23", "a")).toBe(1)
  expect(store.increment("2026-11-23", "a")).toBe(2)
  expect(store.increment("2026-11-23", "b")).toBe(1)
  expect(store.increment("2026-11-24", "a")).toBe(1)
  expect(store.counts("2026-11-23")).toEqual({ a: 2, b: 1 })
  expect(store.counts("2026-11-24")).toEqual({ a: 1 })
  store.close()
})

test("limits are replaced, meta is upserted, prune removes old days", () => {
  const store = new Store(dbPath)
  store.setLimits({ a: 800, b: 10 })
  store.setLimits({ a: 500 })
  expect(store.limits()).toEqual({ a: 500 })
  store.setMeta({ timezone: "Europe/Berlin", warnAt: "0.8" })
  store.setMeta({ warnAt: "0.9" })
  expect(store.meta()).toEqual({ timezone: "Europe/Berlin", warnAt: "0.9" })
  store.increment("2026-08-01", "a")
  store.increment("2026-11-23", "a")
  expect(store.prune("2026-11-01")).toBe(1)
  expect(store.counts("2026-08-01")).toEqual({})
  expect(store.counts("2026-11-23")).toEqual({ a: 1 })
  store.close()
})

test("a second connection sees writes immediately (separate instances share state)", () => {
  const writer = new Store(dbPath)
  const reader = new Store(dbPath)
  writer.increment("2026-11-23", "a")
  expect(reader.counts("2026-11-23")).toEqual({ a: 1 })
  writer.close()
  reader.close()
})

test("concurrent processes never lose an increment", async () => {
  const processes = 8
  const perProcess = 250
  const worker = join(import.meta.dir, "fixtures", "increment-worker.ts")
  new Store(dbPath).close() // create schema up front like a running opencode would

  const procs = Array.from({ length: processes }, () =>
    Bun.spawn([process.execPath, worker, dbPath, String(perProcess)], {
      env: { ...process.env, BUN_BE_BUN: "1" },
      stderr: "pipe",
    }),
  )
  const results = await Promise.all(
    procs.map(async (p) => ({ code: await p.exited, stderr: await new Response(p.stderr).text() })),
  )
  for (const r of results) expect(r).toEqual({ code: 0, stderr: "" })

  const store = new Store(dbPath)
  expect(store.counts("2026-11-23")).toEqual({ academiccloud: processes * perProcess })
  store.close()
}, 60_000)
