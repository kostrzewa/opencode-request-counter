import { expect, test } from "bun:test"
import { homedir } from "node:os"
import { defaultDbPath, parseOptions } from "../src/options.ts"
import { bar, buildRows, formatDuration, levelOf } from "../src/view.ts"

test("parseOptions accepts a valid config", () => {
  const o = parseOptions({ limits: { academiccloud: 800 }, timezone: "Europe/Berlin", warnAt: 0.9, dbPath: "~/x.db" })
  expect(o.limits).toEqual({ academiccloud: 800 })
  expect(o.timezone).toBe("Europe/Berlin")
  expect(o.warnAt).toBe(0.9)
  expect(o.dbPath).toBe(`${homedir()}/x.db`)
  expect(o.historyDays).toBe(90)
})

test("parseOptions ignores bad values with warnings instead of throwing", () => {
  const warnings: string[] = []
  const o = parseOptions(
    { limits: { good: 5, neg: -1, str: "800", frac: 1.5 }, timezone: "Nowhere", warnAt: 2, historyDays: 0 },
    (w) => warnings.push(w),
  )
  expect(o.limits).toEqual({ good: 5 })
  expect(o.warnAt).toBe(0.8)
  expect(o.historyDays).toBe(90)
  expect(o.dbPath).toBe(defaultDbPath())
  expect(warnings.length).toBe(6)
  expect(parseOptions(undefined).limits).toEqual({})
  expect(parseOptions("nonsense").limits).toEqual({})
})

test("levelOf thresholds", () => {
  expect(levelOf(10, undefined, 0.8)).toBe("ok")
  expect(levelOf(639, 800, 0.8)).toBe("ok")
  expect(levelOf(640, 800, 0.8)).toBe("warn")
  expect(levelOf(800, 800, 0.8)).toBe("limit")
  expect(levelOf(900, 800, 0.8)).toBe("limit")
})

test("buildRows: limited providers first, unused limited providers shown", () => {
  const rows = buildRows({ ollama: 3, academiccloud: 142 }, { academiccloud: 800, other: 50 }, 0.8)
  expect(rows.map((r) => [r.provider, r.count, r.limit])).toEqual([
    ["academiccloud", 142, 800],
    ["other", 0, 50],
    ["ollama", 3, undefined],
  ])
  expect(rows[0]!.ratio).toBeCloseTo(0.1775)
})

test("bar and formatDuration", () => {
  expect(bar(0.28)).toBe("███░░░░░░░")
  expect(bar(1.5)).toBe("██████████")
  expect(bar(0)).toBe("░░░░░░░░░░")
  expect(formatDuration(5 * 3600_000 + 12 * 60_000 + 59_000)).toBe("5h 12m")
  expect(formatDuration(12 * 60_000)).toBe("12m")
  expect(formatDuration(30_000)).toBe("<1m")
})
