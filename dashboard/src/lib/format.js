// Number and time formatting shared by every panel.

export function fmtInt(value) {
  return Math.round(Number(value) || 0).toLocaleString('en');
}

export function fmtCompact(value, digits = 1) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: digits })
    .format(Number(value) || 0);
}

export function fmtFixed(value, digits = 2) {
  return (Number(value) || 0).toFixed(digits);
}

export function fmtPct(value, digits = 0) {
  return `${((Number(value) || 0) * 100).toFixed(digits)}%`;
}

export function fmtSigned(value, formatter = fmtCompact) {
  const n = Number(value) || 0;
  return `${n > 0 ? '+' : n < 0 ? '−' : '±'}${formatter(Math.abs(n))}`;
}

export function fmtBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

/** "3d 4h", "5h 20m", "12m" — the two largest units. */
export function fmtDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const m = Math.round(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${mm}m`;
  return `${mm}m`;
}

export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function fmtDateTime(ts) {
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
