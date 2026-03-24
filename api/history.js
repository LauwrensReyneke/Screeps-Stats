// api/history.js — Vercel Serverless Function
// Returns historical snapshots from SQLite.
// Locally: reads from data/screeps-history.db
// Vercel:  reads from Vercel Blob Storage (BLOB_READ_WRITE_TOKEN required)
//
// Query params:
//   room    (string)  — filter to a specific room name
//   limit   (number)  — max rows, default 288
//   since   (number)  — unix ms, only rows with ts >= since
//
// GET /api/history?room=W1N1&limit=144&since=1700000000000

import { queryHistory } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const { room, limit: limitStr, since: sinceStr } = req.query || {};
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
