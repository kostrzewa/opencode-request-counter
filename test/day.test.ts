import { expect, test } from "bun:test"
import { dayKey, isValidTimeZone, nextReset } from "../src/day.ts"

const BERLIN = "Europe/Berlin"

test("dayKey follows Berlin midnight, not UTC midnight", () => {
  // 23:30 UTC on Nov 23 is already 00:30 on Nov 24 in Berlin (CET, UTC+1).
  const t = new Date("2026-11-23T23:30:00Z")
  expect(dayKey("UTC", t)).toBe("2026-11-23")
  expect(dayKey(BERLIN, t)).toBe("2026-11-24")
  // 22:59:59 UTC is still Nov 23 in Berlin.
  expect(dayKey(BERLIN, new Date("2026-11-23T22:59:59Z"))).toBe("2026-11-23")
})

test("nextReset on an ordinary day is the next Berlin midnight", () => {
  expect(nextReset(BERLIN, new Date("2026-11-23T10:15:30.250Z")).toISOString()).toBe("2026-11-23T23:00:00.000Z")
  // In summer (CEST, UTC+2) midnight is 22:00 UTC.
  expect(nextReset(BERLIN, new Date("2026-07-01T12:00:00Z")).toISOString()).toBe("2026-07-01T22:00:00.000Z")
})

test("nextReset across DST changes (23h and 25h days)", () => {
  // 2026-03-29: clocks jump 02:00 -> 03:00, day has 23h; next midnight is 22:00 UTC (CEST).
  expect(nextReset(BERLIN, new Date("2026-03-29T00:30:00Z")).toISOString()).toBe("2026-03-29T22:00:00.000Z")
  // 2026-10-25: clocks fall back 03:00 -> 02:00, day has 25h; next midnight is 23:00 UTC (CET).
  expect(nextReset(BERLIN, new Date("2026-10-24T22:30:00Z")).toISOString()).toBe("2026-10-25T23:00:00.000Z")
})

test("nextReset exactly at midnight returns the following midnight", () => {
  expect(nextReset(BERLIN, new Date("2026-11-23T23:00:00Z")).toISOString()).toBe("2026-11-24T23:00:00.000Z")
})

test("isValidTimeZone", () => {
  expect(isValidTimeZone(BERLIN)).toBe(true)
  expect(isValidTimeZone("Mars/Olympus")).toBe(false)
})
