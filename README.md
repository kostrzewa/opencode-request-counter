# opencode-request-counter

An opencode (≥ 1.19) plugin that counts LLM requests **per provider per day**, across all sessions and all concurrently running opencode instances. You can set a daily maximum for each provider. When you get close to it, the plugin warns you; it never blocks a request.

```
Context
38,214 tokens
29% used
$0.00 spent

Requests today
academiccloud 142 / 800
██░░░░░░░░ 18%
resets in 5h 54m
```

## What is counted

Every call to the model counts. The `chat.params` hook fires once per call: each agent-loop step, each retry, title generation and compaction. That matches how provider quotas count requests. It applies equally to the TUI, `opencode run` and `opencode serve`.

## How counts are shared

Counts live in a SQLite database, `${XDG_DATA_HOME:-~/.local/share}/opencode-request-counter/counter.db`, through Bun's built-in `bun:sqlite`.

- Every increment is a single atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING`. SQLite's file locks serialize writers across processes.
- `busy_timeout=5000` makes a competing process wait for the lock instead of failing.
- WAL mode lets the sidebar read while another process writes.
- `test/store.test.ts` checks this with 8 processes × 250 increments and no lost updates.

Don't put the database on a network filesystem (NFS), because SQLite locking isn't reliable there.

## Installation

`~/.config/opencode/opencode.jsonc` (server part, which does the counting):

```jsonc
"plugin": [
  ["/path/to/opencode-request-counter/src/server.ts", {
    "limits": { "academiccloud": 800 },  // provider id -> max requests per day
    "timezone": "Europe/Berlin",         // the day rolls over at this timezone's midnight (default: system tz)
    "warnAt": 0.8                        // warn from 80% (default 0.8)
    // "dbPath": "~/somewhere/counter.db", "historyDays": 90
  }]
]
```

`~/.config/opencode/tui.json` (sidebar widget):

```json
"plugin": ["/path/to/opencode-request-counter/src/tui.tsx"]
```

If you set `dbPath`, set the same value in the TUI entry too: `["…/src/tui.tsx", { "dbPath": "…" }]`. The server writes the limits, timezone and `warnAt` into the database, so the widget needs no other configuration.

## Why the limit isn't set inside `provider.*`

- `provider.<id>.options` does accept unknown keys (the schema has a catch-all). But those keys are also passed to the AI SDK provider factory.
- `provider.<id>.models.<id>` has a fixed schema, and its `options` are sent in the request body. An unknown key there could break requests.

The plugin options tuple is the officially supported place for plugin settings, and it changes nothing about how a provider behaves.

## Behaviour at the limit

The plugin only warns. Rows turn the theme's *warning* colour from `warnAt` and the *error* colour from 100%, and a toast appears once per provider, threshold and day. The provider rejects requests itself once the real quota is used up.

## Development

There's no separate Bun install; the opencode binary works as Bun when `BUN_BE_BUN=1` is set:

```sh
BUN_BE_BUN=1 opencode install
BUN_BE_BUN=1 opencode test
BUN_BE_BUN=1 opencode x tsc --noEmit
```

Look at the counts directly:

```sh
BUN_BE_BUN=1 opencode -e "const {Database}=require('bun:sqlite');console.log(new Database(process.argv[1]).query('select * from counts order by day').all())" ~/.local/share/opencode-request-counter/counter.db
```
