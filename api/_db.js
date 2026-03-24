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

  const insertSnap = db.prepare(`
    INSERT INTO snapshots (
      ts, tick, cpu_used, cpu_limit, cpu_bucket,
      total_creeps, total_rooms,
      gcl_level, gcl_progress, gcl_progress_total,
      credits
    ) VALUES (
      @ts, @tick, @cpu_used, @cpu_limit, @cpu_bucket,
      @total_creeps, @total_rooms,
      @gcl_level, @gcl_progress, @gcl_progress_total,
      @credits
    )
  `);

  const insertRoom = db.prepare(`
    INSERT INTO room_snapshots (
      snapshot_id, room, shard, rcl,
      energy, energy_cap, creeps, spawns,
      controller_progress, controller_progress_total,
      ticks_to_downgrade,
      storage_energy, terminal_energy,
      hostiles, roles_json
    ) VALUES (
      @snapshot_id, @room, @shard, @rcl,
      @energy, @energy_cap, @creeps, @spawns,
      @controller_progress, @controller_progress_total,
      @ticks_to_downgrade,
      @storage_energy, @terminal_energy,
      @hostiles, @roles_json
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
      gcl_level: s.global?.gcl?.level ?? 0,
      gcl_progress: s.global?.gcl?.progress ?? 0,
      gcl_progress_total: s.global?.gcl?.progressTotal ?? 0,
      credits: s.global?.credits ?? 0,
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
        roles_json: JSON.stringify(room.creepsByRole || {}),
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

export async function queryLatestSnapshot() {
  const db = await openDb();

  const snap = db.prepare(`
    SELECT
      id, ts, tick,
      cpu_used, cpu_limit, cpu_bucket,
      total_creeps, total_rooms,
      gcl_level, gcl_progress, gcl_progress_total,
      credits
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
      hostiles, roles_json
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
    phases: [],
    rooms: rooms.map((r) => ({
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
    },
    global: {
      gcl: {
        level: snap.gcl_level,
        progress: snap.gcl_progress,
        progressTotal: snap.gcl_progress_total,
      },
      credits: snap.credits,
    },
    ts: snap.ts,
  };
}
