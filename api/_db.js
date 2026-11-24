// api/_db.js — Shared SQLite helper
//
// LOCAL mode  (no BLOB_READ_WRITE_TOKEN):
//   SQLite file lives at <project-root>/data/screeps-history.db
//   Reads and writes happen directly.
//
// VERCEL mode (BLOB_READ_WRITE_TOKEN set):
//   SQLite is stored as a single blob in Vercel Blob Storage.

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCAL_DB_DIR = join(__dirname, '..', 'data');
const LOCAL_DB_PATH = join(LOCAL_DB_DIR, 'screeps-history.db');
const BLOB_TMP_PATH = join(tmpdir(), 'screeps-history.db');
const BLOB_KEY = 'screeps-stats/history.db';

function isVercel() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function hasColumn(db, table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((r) => r.name === column);
}

function ensureColumn(db, table, definition) {
  const [name] = definition.split(' ');
  if (!hasColumn(db, table, name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

function applySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      ts                 INTEGER NOT NULL,
      tick               INTEGER NOT NULL,
      cpu_used           REAL    NOT NULL DEFAULT 0,
      cpu_limit          REAL    NOT NULL DEFAULT 0,
      cpu_bucket         INTEGER NOT NULL DEFAULT 0,
      total_creeps       INTEGER NOT NULL DEFAULT 0,
      total_rooms        INTEGER NOT NULL DEFAULT 0,
      gcl_level          INTEGER NOT NULL DEFAULT 0,
      gcl_progress       REAL    NOT NULL DEFAULT 0,
      gcl_progress_total REAL    NOT NULL DEFAULT 0,
      credits            REAL    NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS room_snapshots (
      id                         INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id                INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
      room                       TEXT    NOT NULL,
      shard                      TEXT    NOT NULL DEFAULT 'unknown',
      rcl                        INTEGER NOT NULL DEFAULT 0,
      energy                     INTEGER NOT NULL DEFAULT 0,
      energy_cap                 INTEGER NOT NULL DEFAULT 0,
      creeps                     INTEGER NOT NULL DEFAULT 0,
      spawns                     INTEGER NOT NULL DEFAULT 0,
      controller_progress        REAL    NOT NULL DEFAULT 0,
      controller_progress_total  REAL    NOT NULL DEFAULT 0,
      ticks_to_downgrade         INTEGER NOT NULL DEFAULT 0,
      storage_energy             REAL    NOT NULL DEFAULT 0,
      terminal_energy            REAL    NOT NULL DEFAULT 0,
      hostiles                   INTEGER NOT NULL DEFAULT 0,
      roles_json                 TEXT    NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON snapshots(ts);
    CREATE INDEX IF NOT EXISTS idx_room_snap_room ON room_snapshots(room, snapshot_id);
    CREATE INDEX IF NOT EXISTS idx_room_snap_shard ON room_snapshots(shard, snapshot_id);
  `);

  // Migrations for existing DB files.
  ensureColumn(db, 'snapshots', 'total_creeps INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'snapshots', 'total_rooms INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'snapshots', 'gcl_level INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'snapshots', 'gcl_progress REAL NOT NULL DEFAULT 0');
  ensureColumn(db, 'snapshots', 'gcl_progress_total REAL NOT NULL DEFAULT 0');
  ensureColumn(db, 'snapshots', 'credits REAL NOT NULL DEFAULT 0');

  ensureColumn(db, 'room_snapshots', "shard TEXT NOT NULL DEFAULT 'unknown'");
  ensureColumn(db, 'room_snapshots', 'controller_progress REAL NOT NULL DEFAULT 0');
  ensureColumn(db, 'room_snapshots', 'controller_progress_total REAL NOT NULL DEFAULT 0');
  ensureColumn(db, 'room_snapshots', 'ticks_to_downgrade INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'room_snapshots', 'storage_energy REAL NOT NULL DEFAULT 0');
  ensureColumn(db, 'room_snapshots', 'terminal_energy REAL NOT NULL DEFAULT 0');
  ensureColumn(db, 'room_snapshots', 'hostiles INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'room_snapshots', "roles_json TEXT NOT NULL DEFAULT '{}'");

  // v2: everything else the bot already reports.
  ensureColumn(db, 'snapshots', 'cpu_per_creep REAL NOT NULL DEFAULT 0');
  ensureColumn(db, 'snapshots', 'memory_bytes INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'snapshots', 'owned_rooms INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'snapshots', 'pixels INTEGER');
  ensureColumn(db, 'snapshots', "roles_cpu_json TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'snapshots', "phases_json TEXT NOT NULL DEFAULT '{}'");

  ensureColumn(db, 'room_snapshots', 'owned INTEGER NOT NULL DEFAULT 1');
  ensureColumn(db, 'room_snapshots', 'room_cpu REAL NOT NULL DEFAULT 0');
  ensureColumn(db, 'room_snapshots', 'hostile_offence INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'room_snapshots', 'safe_mode INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'room_snapshots', "distress_json TEXT NOT NULL DEFAULT '[]'");
}

async function downloadBlob() {
  try {
    const { head } = await import('@vercel/blob');
    const info = await head(BLOB_KEY);
    if (!info) return false;
    const res = await fetch(info.downloadUrl);
    if (!res.ok) return false;
    writeFileSync(BLOB_TMP_PATH, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}

async function uploadBlob() {
  const { put } = await import('@vercel/blob');
  const buf = readFileSync(BLOB_TMP_PATH);
  await put(BLOB_KEY, buf, {
    access: 'public',
    contentType: 'application/x-sqlite3',
    addRandomSuffix: false,
  });
}

async function openDb() {
  if (isVercel()) {
    await downloadBlob();
    const db = new Database(BLOB_TMP_PATH);
    applySchema(db);
    return db;
  }

  if (!existsSync(LOCAL_DB_DIR)) {
    mkdirSync(LOCAL_DB_DIR, { recursive: true });
  }
  const db = new Database(LOCAL_DB_PATH);
  applySchema(db);
  return db;
}

function safeJson(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function persistSnapshot(stats) {
  const db = await openDb();

  // The stats segment only changes every 20 game ticks; a second poll of the
  // same frame would be a duplicate point.
  const last = db.prepare('SELECT tick FROM snapshots ORDER BY ts DESC LIMIT 1').get();
  if (last && last.tick === stats.tick) {
    db.close();
    return;
  }

  const insertSnap = db.prepare(`
    INSERT INTO snapshots (
      ts, tick, cpu_used, cpu_limit, cpu_bucket,
      total_creeps, total_rooms, owned_rooms,
      gcl_level, gcl_progress, gcl_progress_total,
      credits, pixels,
      cpu_per_creep, memory_bytes,
      roles_cpu_json, phases_json
    ) VALUES (
      @ts, @tick, @cpu_used, @cpu_limit, @cpu_bucket,
      @total_creeps, @total_rooms, @owned_rooms,
      @gcl_level, @gcl_progress, @gcl_progress_total,
      @credits, @pixels,
      @cpu_per_creep, @memory_bytes,
      @roles_cpu_json, @phases_json
    )
  `);

  const insertRoom = db.prepare(`
    INSERT INTO room_snapshots (
      snapshot_id, room, shard, rcl, owned,
      energy, energy_cap, creeps, spawns,
      controller_progress, controller_progress_total,
      ticks_to_downgrade,
      storage_energy, terminal_energy,
      hostiles, hostile_offence, safe_mode,
      room_cpu, roles_json, distress_json
    ) VALUES (
      @snapshot_id, @room, @shard, @rcl, @owned,
      @energy, @energy_cap, @creeps, @spawns,
      @controller_progress, @controller_progress_total,
      @ticks_to_downgrade,
      @storage_energy, @terminal_energy,
      @hostiles, @hostile_offence, @safe_mode,
      @room_cpu, @roles_json, @distress_json
    )
  `);

  const tx = db.transaction((s) => {
    const { lastInsertRowid } = insertSnap.run({
      ts: s.ts,
      tick: s.tick,
      cpu_used: s.cpu.used,
      cpu_limit: s.cpu.limit,
      cpu_bucket: s.cpu.bucket,
      total_creeps: s.totals?.creeps ?? 0,
      total_rooms: s.totals?.rooms ?? 0,
      owned_rooms: s.totals?.ownedRooms ?? 0,
      gcl_level: s.global?.gcl?.level ?? 0,
      gcl_progress: s.global?.gcl?.progress ?? 0,
      gcl_progress_total: s.global?.gcl?.progressTotal ?? 0,
      credits: s.global?.credits ?? 0,
      pixels: s.global?.pixels ?? null,
      cpu_per_creep: s.cpuPerCreep ?? 0,
      memory_bytes: s.memoryBytes ?? 0,
      roles_cpu_json: JSON.stringify(s.roles || {}),
      phases_json: JSON.stringify(Object.fromEntries((s.phases || []).map((p) => [p.name, p.duration]))),
    });

    for (const room of s.rooms || []) {
      insertRoom.run({
        snapshot_id: lastInsertRowid,
        room: room.name,
        shard: room.shard || 'unknown',
        rcl: room.rcl,
        energy: room.energy,
        energy_cap: room.energyCapacity,
        creeps: room.creeps,
        spawns: room.spawns,
        controller_progress: room.controllerProgress ?? 0,
        controller_progress_total: room.controllerProgressTotal ?? 0,
        ticks_to_downgrade: room.ticksToDowngrade ?? 0,
        storage_energy: room.storageEnergy ?? 0,
        terminal_energy: room.terminalEnergy ?? 0,
        hostiles: room.hostiles ?? 0,
        hostile_offence: room.hostileOffence ?? 0,
        safe_mode: room.safeMode ?? 0,
        owned: room.owned === false ? 0 : 1,
        room_cpu: room.cpuTotal ?? 0,
        roles_json: JSON.stringify(room.creepsByRole || {}),
        distress_json: JSON.stringify(room.distress || []),
      });
    }
  });

  tx(stats);
  db.close();

  if (isVercel()) {
    await uploadBlob();
  }
}

export async function queryHistory({ room, limit = 288, since } = {}) {
  const db = await openDb();

  let rows;
  if (room) {
    const sinceClause = since ? 'AND s.ts >= @since' : '';
    rows = db.prepare(`
      SELECT
        s.ts, s.tick,
        s.cpu_used, s.cpu_limit, s.cpu_bucket,
        s.total_creeps, s.total_rooms,
        s.gcl_level, s.gcl_progress, s.gcl_progress_total,
        s.credits,
        r.room, r.shard, r.rcl,
        r.energy, r.energy_cap,
        r.creeps, r.spawns,
        r.controller_progress, r.controller_progress_total,
        r.ticks_to_downgrade,
        r.storage_energy, r.terminal_energy,
        r.hostiles, r.roles_json
      FROM snapshots s
      JOIN room_snapshots r ON r.snapshot_id = s.id
      WHERE r.room = @room ${sinceClause}
      ORDER BY s.ts DESC
      LIMIT @limit
    `).all({ room, limit, since: since ?? 0 });
  } else {
    const sinceClause = since ? 'AND ts >= @since' : '';
    rows = db.prepare(`
      SELECT
        ts, tick,
        cpu_used, cpu_limit, cpu_bucket,
        total_creeps, total_rooms,
        gcl_level, gcl_progress, gcl_progress_total,
        credits
      FROM snapshots
      WHERE 1=1 ${sinceClause}
      ORDER BY ts DESC
      LIMIT @limit
    `).all({ limit, since: since ?? 0 });
  }

  db.close();

  if (room) {
    return rows.map((r) => ({ ...r, roles: safeJson(r.roles_json, {}) }));
  }
  return rows;
}

// ─── Range queries, downsampled ──────────────────────────────────────────────
//
// The dashboard asks for a time range and a target point count. Rows in each
// time bucket are folded into one point: gauges averaged, counters and levels
// taken from the bucket's last row, and JSON maps averaged per key. One request
// returns every room, instead of one request per room.

const GLOBAL_AVG = ['cpu_used', 'cpu_limit', 'cpu_bucket', 'total_creeps', 'total_rooms', 'owned_rooms', 'cpu_per_creep', 'memory_bytes'];
const GLOBAL_LAST = ['tick', 'gcl_level', 'gcl_progress', 'gcl_progress_total', 'credits', 'pixels'];
const ROOM_AVG = ['energy', 'energy_cap', 'creeps', 'storage_energy', 'terminal_energy', 'hostiles', 'hostile_offence', 'room_cpu'];
const ROOM_LAST = ['tick', 'rcl', 'owned', 'spawns', 'controller_progress', 'controller_progress_total', 'ticks_to_downgrade', 'safe_mode'];

function bucketSizeFor(since, until, points) {
  const span = Math.max(1, until - since);
  return Math.max(60_000, Math.ceil(span / Math.max(1, points)));
}

function averageMaps(maps) {
  const sums = {};
  let n = 0;
  for (const m of maps) {
    // Rows from before a column existed hold '{}': no data, not zero.
    if (!m || typeof m !== 'object' || !Object.keys(m).length) continue;
    n++;
    for (const [k, v] of Object.entries(m)) {
      if (v && typeof v === 'object') {
        // role CPU entries: { count, cpu, cpuPer }
        const acc = sums[k] || (sums[k] = { count: 0, cpu: 0 });
        acc.count += Number(v.count) || 0;
        acc.cpu += Number(v.cpu) || 0;
      } else {
        sums[k] = (sums[k] || 0) + (Number(v) || 0);
      }
    }
  }
  if (!n) return {};
  const out = {};
  for (const [k, v] of Object.entries(sums)) {
    if (typeof v === 'object') {
      const count = v.count / n;
      const cpu = v.cpu / n;
      out[k] = { count, cpu, cpuPer: count ? cpu / count : 0 };
    } else {
      out[k] = v / n;
    }
  }
  return out;
}

function fold(rows, bucketMs, avgCols, lastCols, mapCols) {
  const buckets = new Map();
  for (const r of rows) {
    const key = Math.floor(r.ts / bucketMs) * bucketMs;
    let b = buckets.get(key);
    if (!b) { b = []; buckets.set(key, b); }
    b.push(r);
  }

  const out = [];
  for (const [start, group] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    const lastRow = group[group.length - 1];
    const point = { ts: lastRow.ts, bucket: start, samples: group.length };
    for (const c of avgCols) point[c] = group.reduce((s, r) => s + (Number(r[c]) || 0), 0) / group.length;
    for (const c of lastCols) point[c] = lastRow[c];
    for (const [col, name] of mapCols) {
      point[name] = name === 'roles' || name === 'distress'
        ? safeJson(lastRow[col], name === 'distress' ? [] : {})
        : averageMaps(group.map((r) => safeJson(r[col], {})));
    }
    out.push(point);
  }
  return out;
}

/**
 * Global series for a time range.
 * @returns {{rows: object[], bucketMs: number}}
 */
export async function queryRange({ since = 0, until = Date.now(), points = 240 } = {}) {
  const db = await openDb();
  const rows = db.prepare(`
    SELECT ts, ${[...GLOBAL_AVG, ...GLOBAL_LAST].join(', ')}, roles_cpu_json, phases_json
    FROM snapshots
    WHERE ts >= @since AND ts <= @until
    ORDER BY ts ASC
  `).all({ since, until });
  db.close();

  const from = rows.length ? rows[0].ts : since;
  const bucketMs = bucketSizeFor(from, until, points);
  return {
    bucketMs,
    rows: fold(rows, bucketMs, GLOBAL_AVG, GLOBAL_LAST, [['roles_cpu_json', 'roles_cpu'], ['phases_json', 'phases']]),
  };
}

/**
 * Per-room series for a time range, every room in one response.
 * @returns {{rooms: Object<string, object[]>, bucketMs: number}}
 */
export async function queryRoomsRange({ since = 0, until = Date.now(), points = 120 } = {}) {
  const db = await openDb();
  const rows = db.prepare(`
    SELECT s.ts, s.tick, r.room, r.shard, ${[...ROOM_AVG, ...ROOM_LAST.filter((c) => c !== 'tick')].map((c) => `r.${c}`).join(', ')},
           r.roles_json, r.distress_json
    FROM snapshots s
    JOIN room_snapshots r ON r.snapshot_id = s.id
    WHERE s.ts >= @since AND s.ts <= @until
    ORDER BY s.ts ASC
  `).all({ since, until });
  db.close();

  const from = rows.length ? rows[0].ts : since;
  const bucketMs = bucketSizeFor(from, until, points);
  const byRoom = {};
  for (const r of rows) (byRoom[r.room] || (byRoom[r.room] = [])).push(r);

  const rooms = {};
  for (const [name, list] of Object.entries(byRoom)) {
    rooms[name] = fold(list, bucketMs, ROOM_AVG, ROOM_LAST, [['roles_json', 'roles'], ['distress_json', 'distress']]);
  }
  return { bucketMs, rooms };
}

export async function queryLatestSnapshot() {
  const db = await openDb();

  const snap = db.prepare(`
    SELECT
      id, ts, tick,
      cpu_used, cpu_limit, cpu_bucket,
      total_creeps, total_rooms, owned_rooms,
      gcl_level, gcl_progress, gcl_progress_total,
      credits, pixels, cpu_per_creep, memory_bytes,
      roles_cpu_json, phases_json
    FROM snapshots
    ORDER BY ts DESC
    LIMIT 1
  `).get();

  if (!snap) {
    db.close();
    return null;
  }

  const rooms = db.prepare(`
    SELECT
      room, shard, rcl,
      energy, energy_cap,
      creeps, spawns,
      controller_progress, controller_progress_total,
      ticks_to_downgrade,
      storage_energy, terminal_energy,
      hostiles, hostile_offence, safe_mode, owned, room_cpu,
      roles_json, distress_json
    FROM room_snapshots
    WHERE snapshot_id = @snapshotId
    ORDER BY room ASC
  `).all({ snapshotId: snap.id });

  db.close();

  return {
    tick: snap.tick,
    cpu: {
      used: snap.cpu_used,
      limit: snap.cpu_limit,
      bucket: snap.cpu_bucket,
      start: snap.cpu_used,
    },
    phases: Object.entries(safeJson(snap.phases_json, {})).map(([name, duration]) => ({ name, duration })),
    roles: safeJson(snap.roles_cpu_json, {}),
    cpuPerCreep: snap.cpu_per_creep,
    memoryBytes: snap.memory_bytes,
    rooms: rooms.map((r) => ({
      owned: r.owned !== 0,
      hostileOffence: r.hostile_offence,
      safeMode: r.safe_mode,
      cpu: {},
      cpuTotal: r.room_cpu,
      distress: safeJson(r.distress_json, []),
      name: r.room,
      shard: r.shard,
      rcl: r.rcl,
      energy: r.energy,
      energyCapacity: r.energy_cap,
      creeps: r.creeps,
      spawns: r.spawns,
      controllerProgress: r.controller_progress,
      controllerProgressTotal: r.controller_progress_total,
      ticksToDowngrade: r.ticks_to_downgrade,
      storageEnergy: r.storage_energy,
      terminalEnergy: r.terminal_energy,
      hostiles: r.hostiles,
      creepsByRole: safeJson(r.roles_json, {}),
    })),
    totals: {
      creeps: snap.total_creeps,
      rooms: snap.total_rooms,
      ownedRooms: snap.owned_rooms,
    },
    global: {
      gcl: {
        level: snap.gcl_level,
        progress: snap.gcl_progress,
        progressTotal: snap.gcl_progress_total,
      },
      credits: snap.credits,
      ...(snap.pixels === null || snap.pixels === undefined ? {} : { pixels: snap.pixels }),
    },
    ts: snap.ts,
  };
}
