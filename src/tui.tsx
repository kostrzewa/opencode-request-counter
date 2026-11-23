/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createSignal, For, Show, type Accessor } from "solid-js"
import { dayKey, isValidTimeZone, nextReset, systemTimeZone } from "./day.ts"
import { defaultDbPath } from "./options.ts"
import { Store } from "./store.ts"
import { bar, buildRows, formatDuration, levelRank, type Level, type Row } from "./view.ts"

const ID = "request-counter"
/** Placed right after opencode's built-in Context block (order 100) and before MCP (200). */
const SIDEBAR_ORDER = 150
const REFRESH_MS = 2000
const NOTIFIED_KEY = `${ID}.notified`

type Snapshot = { day: string; rows: Row[]; resetIn: string }

function readSnapshot(store: Store): Snapshot {
  // Timezone and warn threshold are written by the server plugin, so the
  // widget follows the opencode.jsonc config without duplicating it.
  const meta = store.meta()
  const timezone = meta.timezone && isValidTimeZone(meta.timezone) ? meta.timezone : systemTimeZone()
  const warnAt = Number(meta.warnAt) > 0 ? Number(meta.warnAt) : 0.8
  const now = new Date()
  const day = dayKey(timezone, now)
  return {
    day,
    rows: buildRows(store.counts(day), store.limits(), warnAt),
    resetIn: formatDuration(nextReset(timezone, now).getTime() - now.getTime()),
  }
}

/** Toast once per provider and threshold per day (state kept in opencode's KV store). */
function notify(api: TuiPluginApi, snap: Snapshot) {
  if (!api.kv.ready) return
  const stored = api.kv.get<{ day?: string; levels?: Record<string, Level> }>(NOTIFIED_KEY, {})
  const levels = stored.day === snap.day ? { ...stored.levels } : {}
  let changed = stored.day !== snap.day
  for (const row of snap.rows) {
    if (row.level === "ok" || !row.limit) continue
    // Keyed by limit too, so changing a limit mid-day re-arms its warnings.
    const key = `${row.provider}@${row.limit}`
    if (levelRank[row.level] <= levelRank[levels[key] ?? "ok"]) continue
    levels[key] = row.level
    changed = true
    api.ui.toast(
      row.level === "limit"
        ? {
            variant: "error",
            title: "Daily request limit reached",
            message: `${row.provider}: ${row.count} / ${row.limit} requests today`,
          }
        : {
            variant: "warning",
            title: "Approaching daily request limit",
            message: `${row.provider}: ${row.count} / ${row.limit} requests today (${Math.round(row.ratio! * 100)}%)`,
          },
    )
  }
  if (changed) api.kv.set(NOTIFIED_KEY, { day: snap.day, levels })
}

function RequestsToday(props: { api: TuiPluginApi; snap: Accessor<Snapshot> }) {
  const theme = () => props.api.theme.current
  const color = (level: Level) =>
    level === "limit" ? theme().error : level === "warn" ? theme().warning : theme().textMuted
  return (
    <box>
      <text fg={theme().text}>
        <b>Requests today</b>
      </text>
      <For each={props.snap().rows} fallback={<text fg={theme().textMuted}>none yet</text>}>
        {(row) => (
          <box>
            <text fg={color(row.level)}>
              {row.limit ? `${row.provider} ${row.count} / ${row.limit}` : `${row.provider} ${row.count}`}
            </text>
            <Show when={row.ratio !== undefined}>
              <text fg={color(row.level)}>{`${bar(row.ratio!)} ${Math.round(row.ratio! * 100)}%`}</text>
            </Show>
          </box>
        )}
      </For>
      <text fg={theme().textMuted}>{`resets in ${props.snap().resetIn}`}</text>
    </box>
  )
}

const tui: TuiPlugin = async (api, options) => {
  const dbPath = typeof options?.dbPath === "string" && options.dbPath.trim() ? options.dbPath : defaultDbPath()

  let store: Store
  try {
    store = new Store(dbPath)
  } catch (err) {
    api.ui.toast({ variant: "error", title: ID, message: `cannot open ${dbPath}: ${err}` })
    return
  }

  const [snap, setSnap] = createSignal<Snapshot>(readSnapshot(store), {
    equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  })

  const refresh = () => {
    try {
      const next = readSnapshot(store)
      setSnap(next)
      notify(api, next)
    } catch {
      // DB briefly unavailable (e.g. locked past busy_timeout); try again next tick.
    }
  }

  // Polling picks up requests made by *other* opencode instances; the event
  // gives near-instant updates for this instance's own requests.
  const timer = setInterval(refresh, REFRESH_MS)
  const off = api.event.on("message.updated", refresh)
  api.lifecycle.onDispose(() => {
    clearInterval(timer)
    off()
    try {
      store.close()
    } catch {}
  })

  api.slots.register({
    order: SIDEBAR_ORDER,
    slots: {
      sidebar_content: () => <RequestsToday api={api} snap={snap} />,
    },
  })

  refresh()
}

export default { id: ID, tui } satisfies TuiPluginModule
