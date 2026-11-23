// Spawned by store.test.ts: a separate OS process hammering the shared DB.
import { Store } from "../../src/store.ts"

const [dbPath, n, provider = "academiccloud"] = process.argv.slice(2)
const store = new Store(dbPath!)
for (let i = 0; i < Number(n); i++) store.increment("2026-11-23", provider)
store.close()
