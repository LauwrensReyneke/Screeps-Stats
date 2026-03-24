import 'dotenv/config';
import { rm } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const localDbPath = join(root, 'data', 'screeps-history.db');
const blobKey = 'screeps-stats/history.db';
const clearBlob = process.argv.includes('--blob');

async function resetLocal() {
  await rm(localDbPath, { force: true });
  console.log(`[reset-history] removed local db: ${localDbPath}`);
}

async function resetBlob() {
  if (!clearBlob) return;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.log('[reset-history] skipped blob delete: BLOB_READ_WRITE_TOKEN is not set');
    return;
  }

  const { del } = await import('@vercel/blob');
  await del(blobKey);
  console.log(`[reset-history] removed blob db: ${blobKey}`);
}

async function main() {
  await resetLocal();
  await resetBlob();
  console.log('[reset-history] done');
}

main().catch((err) => {
  console.error('[reset-history] failed:', err.message);
  process.exit(1);
});

