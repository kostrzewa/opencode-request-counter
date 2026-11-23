import { homedir } from "node:os"
import { join } from "node:path"
import { isValidTimeZone, systemTimeZone } from "./day.ts"

export type Options = {
  /** provider id -> maximum number of requests per day */
  limits: Record<string, number>
  /** IANA timezone whose midnight starts a new counting day */
  timezone: string
  /** fraction of the limit (0..1] at which to start warning */
  warnAt: number
  /** SQLite file shared by all opencode instances */
  dbPath: string
  /** how many days of history to keep */
  historyDays: number
}

export function defaultDbPath(): string {
  const base = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")
  return join(base, "opencode-request-counter", "counter.db")
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/**
 * Lenient parsing: anything invalid is reported through `warn` and replaced
 * by its default. A typo in the config must never stop opencode from working.
 */
export function parseOptions(raw: unknown, warn: (msg: string) => void = () => {}): Options {
  const o = isRecord(raw) ? raw : {}
  if (raw !== undefined && !isRecord(raw)) warn("plugin options must be an object; using defaults")

  const limits: Record<string, number> = {}
  if (o.limits !== undefined) {
    if (!isRecord(o.limits)) warn(`"limits" must be an object of provider id -> number`)
    else
      for (const [provider, max] of Object.entries(o.limits)) {
        if (typeof max === "number" && Number.isInteger(max) && max > 0) limits[provider] = max
        else warn(`ignoring limit for "${provider}": expected a positive integer, got ${JSON.stringify(max)}`)
      }
  }

  let timezone = systemTimeZone()
  if (o.timezone !== undefined) {
    if (typeof o.timezone === "string" && isValidTimeZone(o.timezone)) timezone = o.timezone
    else warn(`invalid "timezone" ${JSON.stringify(o.timezone)}; using ${timezone}`)
  }

  let warnAt = 0.8
  if (o.warnAt !== undefined) {
    if (typeof o.warnAt === "number" && o.warnAt > 0 && o.warnAt <= 1) warnAt = o.warnAt
    else warn(`invalid "warnAt" ${JSON.stringify(o.warnAt)}; expected a number in (0, 1], using ${warnAt}`)
  }

  let dbPath = defaultDbPath()
  if (o.dbPath !== undefined) {
    if (typeof o.dbPath === "string" && o.dbPath.trim()) dbPath = o.dbPath.replace(/^~(?=$|\/)/, homedir())
    else warn(`invalid "dbPath"; using ${dbPath}`)
  }

  let historyDays = 90
  if (o.historyDays !== undefined) {
    if (typeof o.historyDays === "number" && Number.isInteger(o.historyDays) && o.historyDays >= 1)
      historyDays = o.historyDays
    else warn(`invalid "historyDays"; using ${historyDays}`)
  }

  return { limits, timezone, warnAt, dbPath, historyDays }
}
