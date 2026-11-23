/**
 * Day-boundary helpers. All counting is keyed by the calendar day in a
 * configurable IANA timezone, so the counter rolls over exactly when the
 * provider's quota does (e.g. Europe/Berlin midnight), regardless of the
 * machine's own timezone.
 */

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
    formatters.set(timeZone, f)
  }
  return f
}

export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone })
    return true
  } catch {
    return false
  }
}

/** Calendar day (`YYYY-MM-DD`) and seconds elapsed since local midnight, in `timeZone`. */
function wallClock(timeZone: string, date: Date): { key: string; secs: number } {
  const p: Record<string, string> = {}
  for (const part of formatter(timeZone).formatToParts(date)) p[part.type] = part.value
  return {
    key: `${p.year}-${p.month}-${p.day}`,
    secs: Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second) + date.getUTCMilliseconds() / 1000,
  }
}

/** The counting key for `date`: its calendar day in `timeZone`, as `YYYY-MM-DD`. */
export function dayKey(timeZone: string, date: Date = new Date()): string {
  return wallClock(timeZone, date).key
}

/**
 * The instant at which the next calendar day starts in `timeZone`.
 * Starts from a 24h estimate and corrects it, which handles 23h/25h DST days.
 */
export function nextReset(timeZone: string, now: Date = new Date()): Date {
  const start = wallClock(timeZone, now)
  let t = now.getTime() + (86400 - start.secs) * 1000
  for (let i = 0; i < 4; i++) {
    const { key, secs } = wallClock(timeZone, new Date(t))
    if (key === start.key) t += (86400 - secs) * 1000 // short of midnight (25h day)
    else if (secs > 0) t -= secs * 1000 // overshot into the next day (23h day)
    else break
  }
  return new Date(t)
}
