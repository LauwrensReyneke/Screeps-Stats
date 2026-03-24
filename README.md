# Screeps Stats Dashboard

A Vue 3 + Vite dashboard hosted on Vercel that visualises `Memory.stats` from Screeps.  
Your Screeps token is **never exposed to the browser** — all API calls are proxied through a Vercel serverless function.

```
Browser  ──►  /api/stats  ──►  Screeps API
                (Vercel fn)          │
                    ◄────────────────┘
                normalized JSON
```

---

## Project structure

```
.
├── api/
│   ├── stats.js          # Serverless: fetch + normalize Memory.stats
│   └── health.js         # Serverless: liveness check
├── dashboard/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.js
│       ├── App.vue        # Root – polling, layout, state
│       ├── styles.css     # Dark global theme
│       └── components/
│           ├── StatCard.vue
│           ├── PhaseBars.vue
│           └── RoomsTable.vue
├── vercel.json
├── .env.example
└── README.md
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SCREEPS_TOKEN` | ✅ | Your Screeps API token (Account → Settings → Auth Tokens) |
| `SCREEPS_API_BASE_URL` | ✅ | `https://screeps.com` (or private server URL) |
| `SCREEPS_SHARD` | optional | Shard name, e.g. `shard0` (default: `shard0`) |

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

> ⚠️ **Never commit `.env` to version control.** It contains your secret token.

---

## Local development

No Vercel CLI needed. Everything runs with plain Node + Vite.

### 1. Install dependencies

```bash
# From project root
npm install
cd dashboard && npm install && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your real values:

```
SCREEPS_TOKEN=your_actual_token
SCREEPS_API_BASE_URL=https://screeps.com
SCREEPS_SHARD=shard0
# BLOB_READ_WRITE_TOKEN=   ← leave blank locally; history tab will be hidden
```

### 3. Start everything with one command

```bash
npm run dev
```

This starts two processes in parallel (via `concurrently`):

| Process | What it does | URL |
|---|---|---|
| **API** (`node server.js`) | Express server that imports and runs `api/*.js` handlers, reads `.env` | http://localhost:3000 |
| **UI** (`vite`) | Vue dev server with HMR, proxies `/api/*` → port 3000 | http://localhost:5173 |

Open **http://localhost:5173** in your browser.

### Verify the API directly

```bash
# Should return { ok: true, ts: ... }
curl http://localhost:3000/api/health

# Should return normalized stats JSON (needs valid SCREEPS_TOKEN in .env)
curl http://localhost:3000/api/stats

# Should return { rows: [], count: 0 } or 503 if BLOB_READ_WRITE_TOKEN not set
curl http://localhost:3000/api/history
```

### Run API only (no frontend)

```bash
npm run api
```

### Run frontend only (if API is already running separately)

```bash
npm run ui
```

---

## Build

```bash
cd dashboard
npm install
npm run build     # outputs to dashboard/dist/
```

---

## Deploy to Vercel

### First deploy

```bash
# From project root
vercel
```

Follow the prompts. Vercel will detect `vercel.json` and:
- Build the Vue app from `dashboard/`
- Serve `dashboard/dist/` as static assets
- Deploy `api/*.js` as serverless functions

### Set environment variables

In the Vercel dashboard → Project → Settings → Environment Variables, add:

| Key | Value |
|---|---|
| `SCREEPS_TOKEN` | your token |
| `SCREEPS_API_BASE_URL` | `https://screeps.com` |
| `SCREEPS_SHARD` | `shard0` (optional) |

Or via CLI:

```bash
vercel env add SCREEPS_TOKEN
vercel env add SCREEPS_API_BASE_URL
vercel env add SCREEPS_SHARD
```

Then redeploy:

```bash
vercel --prod
```

---

## Screeps Memory.stats convention

The dashboard expects your Screeps bot to populate `Memory.stats` every tick. A minimal example:

```js
// In your main loop (main.js / main.ts)
Memory.stats = {
  tick: Game.time,
  cpu: {
    used:   Game.cpu.getUsed(),
    limit:  Game.cpu.limit,
    bucket: Game.cpu.bucket,
    start:  Game.cpu.getUsed(), // capture at loop start
  },
  phases: {
    spawning:    cpuSpawning,
    movement:    cpuMovement,
    harvesting:  cpuHarvesting,
    building:    cpuBuilding,
  },
  rooms: {
    [roomName]: {
      rcl:              room.controller?.level ?? 0,
      energy:           room.energyAvailable,
      energyCapacity:   room.energyCapacityAvailable,
      creeps:           Object.keys(Game.creeps).filter(n => Game.creeps[n].room.name === roomName).length,
      spawns:           Object.values(Game.spawns).filter(s => s.room.name === roomName).length,
    },
  },
};
```

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Vue 3, Vite |
| API proxy | Vercel Serverless Functions (Node.js) |
| Hosting | Vercel |
| Styling | Tailwind CSS utility classes |
