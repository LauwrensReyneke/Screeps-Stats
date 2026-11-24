// api/history.js — Vercel Serverless Function
// Returns historical snapshots from SQLite.
// Locally: reads from data/screeps-history.db
// Vercel:  reads from Vercel Blob Storage (BLOB_READ_WRITE_TOKEN required)
//
// Range mode (used by the dashboard):
//   since   (number)  — unix ms; 0 = all history
//   points  (number)  — target point count; rows are folded into time buckets
//   scope   ('rooms') — every room's series in one response
//
//   GET /api/history?since=1700000000000&points=240
//   GET /api/history?since=1700000000000&points=120&scope=rooms
//
// Legacy mode (raw rows):
//   room    (string)  — filter to a specific room name
//   limit   (number)  — max rows, default 288
//   since   (number)  — unix ms, only rows with ts >= since

import { queryHistory, queryRange, queryRoomsRange } from './_db.js';

const MAX_POINTS = 1000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const { room, limit: limitStr, since: sinceStr, points: pointsStr, scope } = req.query || {};

  // Range mode (dashboard v2): ?since=<ms>&points=<n>[&scope=rooms]
  // Server-side downsampling to roughly `points` buckets across the range;
  // scope=rooms returns every room's series in one response.
  if (pointsStr !== undefined) {
    const points = Math.max(10, Math.min(Number(pointsStr) || 240, MAX_POINTS));
    const sinceMs = Number(sinceStr) || 0;
    try {
      const result = scope === 'rooms'
        ? await queryRoomsRange({ since: sinceMs, points })
        : await queryRange({ since: sinceMs, points });
      res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
      res.status(200).json(result);
    } catch (err) {
      console.error('[api/history] range query error:', err.message);
      res.status(502).json({ error: 'Failed to query history' });
    }
    return;
  }

  // Legacy mode: newest `limit` raw rows, optionally for one room.
  const limit = Math.min(Number(limitStr) || 288, 1440);
  const since = sinceStr ? Number(sinceStr) : undefined;

  let rows;
  try {
    rows = await queryHistory({ room: room || undefined, limit, since });
  } catch (err) {
    console.error('[api/history] query error:', err.message);
    res.status(502).json({ error: 'Failed to query history' });
    return;
  }

  // Return in ascending chronological order so charts render left → right
  rows.reverse();

  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
  res.status(200).json({ rows, count: rows.length });
}
