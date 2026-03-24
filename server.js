// server.js — Local development server
// Mimics Vercel's serverless function runtime for api/*.js handlers.
// Reads .env automatically. Run with: node server.js
//
// Endpoints served:
//   GET /api/health
//   GET /api/stats
//   GET /api/history

import 'dotenv/config';
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

// ── Lazy-import each handler (ESM dynamic import) ────────────────────────────

async function loadHandlers() {
  const [health, stats, history] = await Promise.all([
    import('./api/health.js'),
    import('./api/stats.js'),
    import('./api/history.js'),
  ]);
  return {
    health:  health.default,
    stats:   stats.default,
    history: history.default,
  };
}

// ── Wrap Express req/res into Vercel-style req/res ───────────────────────────
// Vercel's Node runtime uses the raw Node http.IncomingMessage / ServerResponse,
// but adds `req.query` (already provided by Express) and `res.status().json()`.
// Express provides both of those natively, so no extra wrapping is needed.

// ── Routes ───────────────────────────────────────────────────────────────────

loadHandlers().then(({ health, stats, history }) => {
  app.all('/api/health',    (req, res) => health(req, res));
  app.all('/api/stats',     (req, res) => stats(req, res));
  app.all('/api/history',   (req, res) => history(req, res));

  // 404 for any other /api/* route
  app.all('/api/*path', (req, res) => {
    res.status(404).json({ error: `No handler for ${req.method} ${req.path}` });
  });

  app.listen(PORT, () => {
    console.log('');
    console.log('  🤖  Screeps Stats — local API server');
    console.log(`  ➜   http://localhost:${PORT}/api/health`);
    console.log(`  ➜   http://localhost:${PORT}/api/stats`);
    console.log(`  ➜   http://localhost:${PORT}/api/history`);
    console.log('');
    console.log('  Frontend (Vite):  http://localhost:5173');
    console.log('');

    // Warn about missing required env vars
    if (!process.env.SCREEPS_TOKEN) {
      console.warn('  ⚠  SCREEPS_TOKEN is not set — edit .env and restart');
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.info('  ℹ  BLOB_READ_WRITE_TOKEN not set — using local SQLite history at data/screeps-history.db');
    }
  });
}).catch((err) => {
  console.error('Failed to load API handlers:', err);
  process.exit(1);
});

