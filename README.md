# Screeps Stats

A dashboard for a Screeps colony. It reads the stats frame your bot writes
to **memory segment 0**, stores a history in SQLite, and shows:

- **Needs attention:**
  - distressed rooms (from the bot's health watchdog);
  - attacks and decaying controllers;
  - starved rooms;
  - CPU near or over its limit.
- **KPIs:**
  - CPU (range average against the limit) and the bucket, with pixels earned;
  - GCL with the ETA to the next level;
  - rooms owned against the GCL cap;
  - creeps with CPU per creep;
  - credits with their change over the range.
- **CPU:** usage against the limit and the 85% pixel gate, plus CPU **by
  role** (table and stacked history) and **by phase**.
- **Colony:** stored energy per room, population by role, credits, and GCL
  progress.
- **Rooms:** controller level with an ETA to the next RCL, spawn energy,
  stored energy and its trend, creeps, room CPU, and status. Select a room
  for its detail drawer.

Your Screeps token never reaches the browser: every Screeps call goes
through the API functions.

```
Browser ──► /api/stats   ──► Screeps API (memory segment 0)
        ──► /api/history ──► SQLite (local file, or Vercel Blob)
```

---

## Project structure

```
.
├── api/
│   ├── stats.js        # fetch segment 0, normalise, persist a snapshot
│   ├── history.js      # range queries, downsampled server-side
│   ├── health.js       # liveness
│   └── _db.js          # SQLite schema, migrations, queries
├── dashboard/          # Vue 3 + Vite + Tailwind
│   └── src/
│       ├── App.vue               # data loading and layout
│       ├── components/           # header, KPI cards, panels, rooms table, room drawer
│       └── lib/
│           ├── apex.js           # ApexCharts defaults (Karla, light grid)
│           ├── derive.js         # ETAs and alerts
│           ├── format.js         # number and time formatting
│           └── prefs.js          # UI preferences in localStorage
├── server.js           # local Express wrapper around api/*.js
└── vercel.json
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SCREEPS_TOKEN` | yes | Screeps API token (Account → Auth Tokens) |
| `SCREEPS_API_BASE_URL` | yes | `https://screeps.com`, or a private server URL |
| `SCREEPS_SHARD` | no | shard name, default `shard0` |
| `BLOB_READ_WRITE_TOKEN` | Vercel only | stores the SQLite history in Vercel Blob; leave unset locally |

```bash
cp .env.example .env   # then fill in your values; never commit .env
```

---

## Local development

```bash
npm install     # API packages
npm run setup   # creates .env from the example, installs the dashboard's packages
npm run dev     # API on :8080 and UI on :8000
```

Open **http://localhost:8000**. Locally, history is written to
`data/screeps-history.db`, which is git-ignored.

To run a second copy alongside (for example, to try changes without
stopping the first):

```bash
PORT=8081 node server.js
cd dashboard && API_PORT=8081 npx vite --port 8001
```

A snapshot is stored whenever `/api/stats` reads a new stats frame: at most
once a minute, and only while the dashboard (or something else) is polling.

---

## API

| Endpoint | Returns |
|---|---|
| `GET /api/stats` | latest normalised frame |
| `GET /api/history?since=<ms>&points=<n>` | global series for the range, folded into about `n` time buckets |
| `GET /api/history?since=<ms>&points=<n>&scope=rooms` | `{ rooms: { W1N1: [...] } }`, every room in one response |
| `GET /api/history?room=W1N1&limit=<n>` | legacy: newest raw rows |
| `GET /api/health` | `{ ok: true }` |

`since=0` means all history. Within each bucket:

- gauges (CPU, energy, creeps) are averaged;
- levels and counters (tick, GCL, RCL, credits) take the bucket's last value;
- per-role CPU and phases are averaged per key.

---

## The stats frame (segment 0)

The bot writes one JSON object to `RawMemory.segments[0]` every 20 ticks.
Anything missing is treated as zero or empty.

```js
{
  tick, ts,
  cpu: { used, limit, bucket, start },
  phases: { creeps: 14.2, spawns: 0.6, ... },          // CPU per main-loop phase
  roles: { miner: { count, cpu, cpuPer }, ... },       // CPU per creep role
  cpuPerCreep, creepCount, roomCount, memoryBytes,
  global: { gcl: { level, progress, progressTotal }, credits, pixels },
  rooms: {
    W1N1: {
      shard, owned, rcl,
      energyAvailable, energyCapacityAvailable,
      storageEnergy, terminalEnergy,
      creepCount, spawnCount, creepsByRole: { miner: 2, ... },
      controllerProgress, controllerProgressTotal, ticksToDowngrade,
      safeMode, safeModeAvailable,
      hostiles, hostileOffence,
      distress: ['no miner for 400 ticks', ...],         // health watchdog reasons
      creeps, spawns, defense, towers, links, planner,   // room CPU by phase
    },
  },
}
```

---

## Deploy to Vercel

```bash
vercel          # first deploy; vercel.json builds dashboard/ and deploys api/*
vercel --prod
```

Set `SCREEPS_TOKEN`, `SCREEPS_API_BASE_URL`, `SCREEPS_SHARD` and
`BLOB_READ_WRITE_TOKEN` under Project → Settings → Environment Variables.
`dashboard/dist` is built on deploy and not committed.

---

## Tech stack

| Layer | Tech |
|---|---|
| UI | Vue 3, Vite, Tailwind CSS (light theme), Karla (self-hosted via Fontsource) |
| Components | Headless UI (tabs, listbox, radio group, switch, popover, dialog) |
| Icons | Font Awesome (solid) |
| Charts | ApexCharts (`vue3-apexcharts`) |
| API | Vercel serverless functions (Node), Express locally |
| Storage | SQLite (`better-sqlite3`), in Vercel Blob when deployed |
