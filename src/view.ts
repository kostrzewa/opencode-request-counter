/** Pure helpers for the sidebar widget (kept separate so they are unit-testable). */

export type Level = "ok" | "warn" | "limit"

export type Row = {
  provider: string
  count: number
  limit?: number
  /** count / limit, only when a limit is configured */
  ratio?: number
  level: Level
}

export const levelRank: Record<Level, number> = { ok: 0, warn: 1, limit: 2 }

export function levelOf(count: number, limit: number | undefined, warnAt: number): Level {
  if (!limit) return "ok"
  const ratio = count / limit
  if (ratio >= 1) return "limit"
  if (ratio >= warnAt) return "warn"
  return "ok"
}

/**
 * One row per provider that either has a limit configured or was used today.
 * Providers with a limit come first, then the rest, each alphabetically.
 */
export function buildRows(counts: Record<string, number>, limits: Record<string, number>, warnAt: number): Row[] {
  const providers = new Set([...Object.keys(limits), ...Object.keys(counts)])
  return [...providers]
    .map((provider): Row => {
      const count = counts[provider] ?? 0
      const limit = limits[provider]
      return {
        provider,
        count,
        limit,
        ratio: limit ? count / limit : undefined,
        level: levelOf(count, limit, warnAt),
      }
    })
    .sort((a, b) => Number(b.limit !== undefined) - Number(a.limit !== undefined) || a.provider.localeCompare(b.provider))
}

/** Text progress bar, clamped to [0, 1]. */
export function bar(ratio: number, width = 10): string {
  const filled = Math.round(Math.min(Math.max(ratio, 0), 1) * width)
  return "█".repeat(filled) + "░".repeat(width - filled)
}

/** "5h 12m", "12m", "<1m". */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return "<1m"
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
