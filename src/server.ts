import type { Plugin, PluginModule } from "@opencode-ai/plugin"
import { dayKey } from "./day.ts"
import { parseOptions } from "./options.ts"
import { Store } from "./store.ts"

const SERVICE = "request-counter"

/**
 * Server side: counts every LLM request per provider per day.
 *
 * `chat.params` runs once per call to the model (each agent-loop step,
 * retries, title generation, compaction), in the TUI, `opencode run` and
 * `opencode serve` alike, so it is exactly the "requests sent" metric a
 * provider quota uses. The plugin only counts; it never blocks a request.
 */
const server: Plugin = async (input, rawOptions) => {
  const log = (level: "info" | "warn" | "error", message: string) =>
    input.client.app.log({ body: { service: SERVICE, level, message } }).catch(() => {})

  const options = parseOptions(rawOptions, (msg) => log("warn", msg))

  let store: Store
  try {
    store = new Store(options.dbPath)
    store.setLimits(options.limits)
    store.setMeta({ timezone: options.timezone, warnAt: String(options.warnAt) })
    store.prune(dayKey(options.timezone, new Date(Date.now() - options.historyDays * 86400_000)))
  } catch (err) {
    log("error", `cannot open ${options.dbPath}, request counting disabled: ${err}`)
    return {}
  }

  return {
    "chat.params": async (hook) => {
      try {
        const provider = hook.model.providerID ?? hook.provider.info.id
        const count = store.increment(dayKey(options.timezone), provider)
        const limit = options.limits[provider]
        if (limit && count === limit) log("warn", `${provider}: daily limit of ${limit} requests reached`)
      } catch (err) {
        // Counting must never break a chat request.
        log("error", `failed to count request: ${err}`)
      }
    },
    dispose: async () => {
      try {
        store.close()
      } catch {}
    },
  }
}

export default { id: SERVICE, server } satisfies PluginModule
