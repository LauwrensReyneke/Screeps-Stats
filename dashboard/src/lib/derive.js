// Derived metrics: rates, ETAs and alerts. Pure functions over API data.

// Ticks to downgrade at a full timer, per RCL (game constant CONTROLLER_DOWNGRADE).
export const CONTROLLER_DOWNGRADE = { 1: 20000, 2: 10000, 3: 20000, 4: 40000, 5: 80000, 6: 120000, 7: 150000, 8: 200000 };

/** Milliseconds per game tick, estimated from a series with ts and tick. */
export function msPerTick(rows) {
  const pts = (rows || []).filter((r) => Number(r.tick) > 0);
  if (pts.length < 2) return null;
  const a = pts[0];
  const b = pts[pts.length - 1];
  const dt = Number(b.ts) - Number(a.ts);
  const dTick = Number(b.tick) - Number(a.tick);
  return dTick > 0 && dt > 0 ? dt / dTick : null;
}

/**
 * Progress rate and time to completion, using only the points since the last
 * level change (progress resets on level-up).
 *
 * @returns {{perTick: number, ticksLeft: number, msLeft: number}|null}
 */
export function progressEta(rows, { progress, total, level }) {
  const pts = (rows || []).filter((r) => Number(r.tick) > 0);
  if (pts.length < 2) return null;
  const currentLevel = pts[pts.length - 1][level];
  const same = pts.filter((r) => r[level] === currentLevel);
  if (same.length < 2) return null;

  const a = same[0];
  const b = same[same.length - 1];
  const dTick = Number(b.tick) - Number(a.tick);
  const gained = Number(b[progress]) - Number(a[progress]);
  const remaining = Number(b[total]) - Number(b[progress]);
  if (dTick <= 0 || gained <= 0 || !(remaining > 0)) return null;

  const perTick = gained / dTick;
  const ticksLeft = remaining / perTick;
  const tickMs = msPerTick(same) || msPerTick(pts);
  return { perTick, ticksLeft, msLeft: tickMs ? ticksLeft * tickMs : null };
}

// An owned room at RCL4+ (it has storage) with almost nothing banked.
export const STARVED_BELOW = 5000;

export function isStarved(room) {
  return !!room.owned && room.rcl >= 4 && storedEnergy(room) < STARVED_BELOW;
}

// Average energy per tower below which towers can't hold off an attack.
export const TOWERS_READY = 500;

/** Average energy per tower, or null for a room with none (or no data). */
export function towerFill(room) {
  return room.towerCount > 0 ? room.towerEnergy / room.towerCount : null;
}

export function towersLow(room) {
  const f = towerFill(room);
  return !!room.owned && f !== null && f < TOWERS_READY;
}

export function storedEnergy(room) {
  return (Number(room.storageEnergy ?? room.storage_energy) || 0) + (Number(room.terminalEnergy ?? room.terminal_energy) || 0);
}

/**
 * Everything worth a human's attention right now, most severe first.
 * @returns {{level: 'critical'|'warning'|'info', title: string, detail: string, room?: string}[]}
 */
export function buildAlerts({ data, history }) {
  const alerts = [];
  if (!data) return alerts;
  const rooms = data.rooms || [];

  for (const room of rooms) {
    if (!room.owned) continue;
    for (const reason of room.distress || []) {
      alerts.push({ level: 'critical', title: `${room.name} distressed`, detail: reason, room: room.name });
    }
    const full = CONTROLLER_DOWNGRADE[room.rcl];
    if (full && room.ticksToDowngrade && room.ticksToDowngrade < full * 0.5 &&
        !(room.distress || []).some((d) => /downgrad/.test(d))) {
      alerts.push({ level: 'critical', title: `${room.name} controller decaying`,
        detail: `${room.ticksToDowngrade.toLocaleString('en')} ticks to downgrade`, room: room.name });
    }
    if (room.hostileOffence > 0) {
      alerts.push({ level: 'critical', title: `${room.name} under attack`,
        detail: `${room.hostiles} hostiles, ${room.hostileOffence} offence`, room: room.name });
    }
    if (towersLow(room)) {
      const attacked = room.hostiles > 0;
      alerts.push({
        level: attacked ? 'critical' : 'warning',
        title: `${room.name} towers ${attacked ? 'empty under attack' : 'not ready'}`,
        detail: `${Math.round(towerFill(room))} energy per tower (${room.towerCount} towers)${attacked ? ' — hostiles present' : ''}`,
        room: room.name,
      });
    }
    if (room.safeMode > 0) {
      alerts.push({ level: 'info', title: `${room.name} in safe mode`, detail: `${room.safeMode.toLocaleString('en')} ticks left`, room: room.name });
    }
    if (isStarved(room)) {
      alerts.push({ level: 'warning', title: `${room.name} starved`,
        detail: `${Math.round(storedEnergy(room)).toLocaleString('en')} energy in storage and terminal`, room: room.name });
    }
  }

  for (const room of rooms) {
    if (room.owned || !(room.hostiles > 0)) continue;
    alerts.push({ level: 'warning', title: `Hostiles in ${room.name}`, detail: `${room.hostiles} hostile creeps (remote or transit room)`, room: room.name });
  }

  const rows = history || [];
  if (rows.length >= 5) {
    const avg = rows.reduce((s, r) => s + (Number(r.cpu_used) || 0), 0) / rows.length;
    const limit = Number(rows[rows.length - 1].cpu_limit) || Number(data.cpu?.limit) || 0;
    if (limit && avg > limit) {
      alerts.push({ level: 'critical', title: 'CPU over limit', detail: `averaging ${avg.toFixed(1)} of ${limit} — the bucket is draining` });
    } else if (limit && avg > limit * 0.85) {
      alerts.push({ level: 'warning', title: 'CPU near limit', detail: `averaging ${avg.toFixed(1)} of ${limit} — pixel generation is paused above 85%` });
    }
  }

  const order = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}

/**
 * Time to the next level over the range, from a rolling progress rate: one
 * point per history row, each using the rate across the preceding window.
 * Rows from before the last level-up are skipped (progress resets).
 *
 * @returns {{eta: [number, number][], perHour: [number, number][]}} days and points/hour
 */
export function etaTrend(rows, { progress, total, level }) {
  const pts = (rows || []).filter((r) => Number(r.tick) > 0 && Number(r[total]) > 0);
  if (pts.length < 3) return { eta: [], perHour: [] };
  const current = pts[pts.length - 1][level];
  const same = pts.filter((r) => r[level] === current);
  const tickMs = msPerTick(same) || msPerTick(pts);
  if (!tickMs || same.length < 3) return { eta: [], perHour: [] };

  // A window of about a fifth of the range: GCL progress arrives in uneven
  // steps (upgraders are replaced, boosts land, stats ticks are sampled), and
  // a short window turned that into ±2-day swings on an hour's range. A
  // fifth still shows a real change within the range.
  const k = Math.max(3, Math.ceil(same.length / 5));
  const eta = [];
  const perHour = [];
  for (let i = k; i < same.length; i++) {
    const a = same[i - k];
    const b = same[i];
    const dTick = Number(b.tick) - Number(a.tick);
    const gained = Number(b[progress]) - Number(a[progress]);
    if (dTick <= 0 || gained <= 0) continue;
    const rate = gained / dTick;
    const left = Number(b[total]) - Number(b[progress]);
    eta.push([Number(b.ts), +((left / rate) * tickMs / 86_400_000).toFixed(2)]);
    perHour.push([Number(b.ts), Math.round(rate * (3_600_000 / tickMs))]);
  }
  return { eta, perHour };
}
