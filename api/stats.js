// api/stats.js — Vercel Serverless Function
// Reads Memory.stats from the Screeps memory-segment API (segment 0).
// Endpoint: GET /api/user/memory-segment?segment=0&shard=<shard>
// Auth:     Authorization: Bearer <SCREEPS_TOKEN>
//
// Persists each successful snapshot to SQLite stored in Vercel Blob.
// Token is read from env vars and never exposed to the browser.

import { persistSnapshot, queryLatestSnapshot } from './_db.js';

const CACHE_HEADER = 's-maxage=2, stale-while-revalidate=8';
const SEGMENT = 0;
const MIN_UPSTREAM_INTERVAL_MS = 60_000;

// In-memory per-instance cache to reduce upstream rate-limit pressure.
let cachedSnapshot = null;
let lastUpstreamFetchAt = 0;

function safeError(message) {
  return { error: message };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPayloadLoggingEnabled(req) {
  return process.env.DEBUG_STATS_LOG === '1' || req.query?.log === '1';
}

function shouldBypassCache(req) {
  return req.query?.force === '1' || req.query?.log === '1';
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRoleMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([role, count]) => [role, num(count, 0)])
  );
}

function summarizePayload(segmentData, normalized, shard) {
  const raw = segmentData && typeof segmentData === 'object' ? segmentData : {};
  const stats = raw.stats && typeof raw.stats === 'object' ? raw.stats : raw;
  const rawRooms = stats.rooms && typeof stats.rooms === 'object' ? stats.rooms : {};
  const roomNames = Array.isArray(rawRooms)
    ? rawRooms.slice(0, 5).map((r) => r?.name || r?.roomName || 'unknown')
    : Object.keys(rawRooms).slice(0, 5);

  return {
    shard,
    topLevelKeys: Object.keys(raw).slice(0, 20),
    statsKeys: Object.keys(stats || {}).slice(0, 20),
    tick: normalized?.tick ?? 0,
    cpu: normalized?.cpu ?? {},
    totals: normalized?.totals ?? {},
    globalKeys: Object.keys(normalized?.global || {}),
    phaseCount: normalized?.phases?.length ?? 0,
    roomCount: normalized?.rooms?.length ?? 0,
    roomSamples: roomNames,
  };
}

function normalizeStats(raw, fallbackShard) {
  const safeRaw = raw && typeof raw === 'object' ? raw : {};
  const stats = safeRaw.stats || safeRaw;

  const tick = num(stats.tick ?? safeRaw.tick, 0);

  const rawCpu = stats.cpu || safeRaw.cpu || {};
  const cpu = {
    used:   num(rawCpu.used, 0),
    limit:  num(rawCpu.limit, 0),
    bucket: num(rawCpu.bucket, 0),
    start:  num(rawCpu.start ?? rawCpu.used, 0),
  };

  const rawPhases = stats.phases || safeRaw.phases || {};
  const phases = Array.isArray(rawPhases)
    ? rawPhases.map((p) => ({
        name: p?.name || 'unknown',
        duration: num(p?.duration, 0),
      }))
    : Object.entries(rawPhases).map(([name, duration]) => ({
        name,
        duration: num(duration, 0),
      }));

  const rawRooms = stats.rooms || safeRaw.rooms || {};
  const rooms = Array.isArray(rawRooms)
    ? rawRooms.map((r) => normalizeRoom(r, fallbackShard))
    : Object.entries(rawRooms).map(([name, data]) =>
        normalizeRoom({ name, ...data }, fallbackShard)
      );

  const rawGlobal = stats.global || safeRaw.global || {};
  const rawGcl = rawGlobal.gcl || {};
  const global = {
    gcl: {
      level: num(rawGcl.level, 0),
      progress: num(rawGcl.progress, 0),
      progressTotal: num(rawGcl.progressTotal, 0),
    },
    credits: num(rawGlobal.credits, 0),
  };

  const totals = {
    creeps: num(stats.creepCount ?? safeRaw.creepCount, rooms.reduce((sum, r) => sum + num(r.creeps, 0), 0)),
    rooms: num(stats.roomCount ?? safeRaw.roomCount, rooms.length),
  };

  return { tick, cpu, phases, rooms, totals, global, ts: Date.now() };
}

function firstFinite(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function normalizeRoom(r, fallbackShard) {
  return {
    name:                    r.name || r.roomName || 'unknown',
    shard:                   r.shard || fallbackShard || 'unknown',
    rcl:                     num(r.rcl ?? r.level ?? r.controller?.level, 0),
    energy:                  num(r.energyAvailable ?? r.energy, 0),
    energyCapacity:          num(r.energyCapacityAvailable ?? r.energyCapacity, 0),
    creeps:                  num(r.creepCount ?? r.creepsCount ?? r.creeps, 0),
    spawns:                  num(r.spawnCount ?? r.spawnsCount ?? r.spawns, 0),
    creepsByRole:            normalizeRoleMap(r.creepsByRole),
    controllerProgress:      num(r.controllerProgress ?? r.controller?.progress, 0),
    controllerProgressTotal: num(r.controllerProgressTotal ?? r.controller?.progressTotal, 0),
    ticksToDowngrade:        num(r.ticksToDowngrade ?? r.controller?.ticksToDowngrade, 0),
    storageEnergy:           firstFinite(r.storageEnergy, r.storage?.energy, r.storage?.store?.energy),
    terminalEnergy:          firstFinite(r.terminalEnergy, r.terminal?.energy, r.terminal?.store?.energy),
    hostiles:                num(r.hostiles, 0),
  };
}

export default async function handler(req, res) {
  const token   = (process.env.SCREEPS_TOKEN || '').trim();
  const baseUrl = (process.env.SCREEPS_API_BASE_URL || 'https://screeps.com').replace(/\/$/, '');
  const shard   = process.env.SCREEPS_SHARD || 'shard0';

  if (!token) {
    console.error('[api/stats] SCREEPS_TOKEN env var is not set');
    res.status(502).json(safeError('Server configuration error: missing credentials'));
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // ── Fetch memory segment ────────────────────────────────────────────────
  // Readable via:
  //   GET https://screeps.com/api/user/memory-segment?segment=0&shard=<shard>
  //   Authorization: Bearer <SCREEPS_TOKEN>
  const endpoint = `${baseUrl}/api/user/memory-segment?segment=${SEGMENT}&shard=${encodeURIComponent(shard)}`;

  // Serve recent cached data to avoid hammering upstream when the frontend polls every 2s.
  const now = Date.now();
  if (!shouldBypassCache(req) && cachedSnapshot && now - lastUpstreamFetchAt < MIN_UPSTREAM_INTERVAL_MS) {
    res.setHeader('Cache-Control', CACHE_HEADER);
    res.status(200).json(cachedSnapshot);
    return;
  }

  let upstream;
  const authAttempts = [
    {
      name: 'bearer',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    },
    {
      name: 'x-token',
      headers: {
        'X-Token': token,
        Accept: 'application/json',
      },
    },
    {
      name: 'x-token-username',
      headers: {
        'X-Token': token,
        'X-Username': token,
        Accept: 'application/json',
      },
    },
  ];

  try {
    for (const attempt of authAttempts) {
      upstream = await fetch(endpoint, {
        headers: attempt.headers,
        signal: AbortSignal.timeout(8000),
      });
      // Retry with another auth mode only for 401 responses.
      if (upstream.status !== 401) break;
    }
  } catch (err) {
    const msg = err.name === 'TimeoutError' ? 'Upstream timeout' : 'Upstream unreachable';
    console.error('[api/stats] fetch error:', err.name);
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json(safeError(msg));
    return;
  }

  if (upstream?.status === 401) {
    console.error('[api/stats] upstream unauthorized (401) after trying all auth header modes');
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json(safeError('Upstream returned 401 (check token/scopes)'));
    return;
  }

  if (upstream?.status === 429) {
    const retryAfterHeader = upstream.headers.get('retry-after');
    const retryAfterSec = Number(retryAfterHeader);
    if (Number.isFinite(retryAfterSec) && retryAfterSec > 0 && retryAfterSec <= 5) {
      await sleep(retryAfterSec * 1000);
      try {
        upstream = await fetch(endpoint, {
          headers: authAttempts[0].headers,
          signal: AbortSignal.timeout(8000),
        });
      } catch {
        // Fall through to cache/error handling below.
      }
    }
  }

  if (upstream?.status === 429) {
    console.warn('[api/stats] upstream rate-limited (429)');
    if (cachedSnapshot) {
      // Gracefully degrade by returning the last known in-memory snapshot.
      res.setHeader('Cache-Control', CACHE_HEADER);
      res.setHeader('Warning', '199 - Upstream rate-limited, serving cached stats');
      res.status(200).json(cachedSnapshot);
      return;
    }

    // Cold-start fallback: try latest persisted snapshot from SQLite/Blob.
    try {
      const persisted = await queryLatestSnapshot();
      if (persisted) {
        cachedSnapshot = persisted;
        lastUpstreamFetchAt = Date.now();
        res.setHeader('Cache-Control', CACHE_HEADER);
        res.setHeader('Warning', '199 - Upstream rate-limited, serving persisted stats');
        res.status(200).json(persisted);
        return;
      }
    } catch (err) {
      console.error('[api/stats] persisted fallback error:', err.message);
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json(safeError('Upstream rate-limited (429)'));
    return;
  }

  if (!upstream?.ok) {
    console.error('[api/stats] upstream HTTP error:', upstream?.status);
    if (cachedSnapshot) {
      res.setHeader('Cache-Control', CACHE_HEADER);
      res.setHeader('Warning', `199 - Upstream ${upstream?.status}, serving cached stats`);
      res.status(200).json(cachedSnapshot);
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json(safeError(`Upstream returned ${upstream?.status || 'unknown'}`));
    return;
  }

  let body;
  try {
    body = await upstream.json();
  } catch {
    console.error('[api/stats] failed to parse upstream JSON');
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json(safeError('Invalid response from upstream'));
    return;
  }

  // Screeps API wraps the segment: { ok: 1, data: "<json string>" }
  if (!body || body.ok !== 1) {
    console.error('[api/stats] upstream ok != 1, error:', body?.error);
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json(safeError('Upstream rejected request'));
    return;
  }

  // ── Parse segment data ──────────────────────────────────────────────────
  let segmentData;
  try {
    // body.data is the raw Memory segment content (often a JSON string).
    if (typeof body.data === 'string') {
      segmentData = body.data.trim() ? JSON.parse(body.data) : {};
    } else if (body.data && typeof body.data === 'object') {
      segmentData = body.data;
    } else {
      // Empty segment (null/undefined) — treat as empty stats instead of crashing.
      segmentData = {};
    }
  } catch {
    console.error('[api/stats] failed to parse segment data as JSON');
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json(safeError('Segment data is not valid JSON'));
    return;
  }

  // ── Normalize ───────────────────────────────────────────────────────────
  let normalized;
  try {
    normalized = normalizeStats(segmentData, shard);
  } catch (err) {
    console.error('[api/stats] normalization error:', err.message);
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json(safeError('Failed to process stats data'));
    return;
  }

  if (isPayloadLoggingEnabled(req)) {
    const summary = summarizePayload(segmentData, normalized, shard);
    const preview = JSON.stringify(segmentData).slice(0, 1200);
    console.log('[api/stats] payload summary:', JSON.stringify(summary));
    console.log('[api/stats] payload preview:', preview);
  }

  // ── Persist to SQLite (fire-and-forget — don't block the response) ──
  // Locally: writes to data/screeps-history.db
  // Vercel:  writes to Vercel Blob (BLOB_READ_WRITE_TOKEN required)
  persistSnapshot(normalized).catch((err) =>
    console.error('[api/stats] persist error:', err.message)
  );

  cachedSnapshot = normalized;
  lastUpstreamFetchAt = Date.now();

  res.setHeader('Cache-Control', CACHE_HEADER);
  res.status(200).json(normalized);
}
