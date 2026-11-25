// ApexCharts defaults: Karla, no toolbar, quiet light grid. Every chart starts
// from base() so they read as one system.

import { computed } from 'vue';

export const FONT = "'Karla Variable', Karla, ui-sans-serif, system-ui, sans-serif";

export const PALETTE = {
  indigo: '#4f46e5',
  sky: '#0ea5e9',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  violet: '#8b5cf6',
  teal: '#14b8a6',
  orange: '#f97316',
  slate: '#64748b',
  grid: '#eef0f4',
  muted: '#94a3b8',
};

export const SERIES_COLORS = [
  PALETTE.indigo, PALETTE.sky, PALETTE.emerald, PALETTE.amber,
  PALETTE.violet, PALETTE.rose, PALETTE.teal, PALETTE.orange, PALETTE.slate,
];

function merge(target, source) {
  for (const [k, v] of Object.entries(source || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') {
      target[k] = merge({ ...target[k] }, v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

export function base(overrides = {}) {
  return merge({
    chart: {
      fontFamily: FONT,
      foreColor: PALETTE.slate,
      toolbar: { show: false },
      zoom: { enabled: false },
      // First draw eases in; a refresh morphs the data in place
      // (dynamicAnimation) instead of redrawing the chart from zero.
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 420,
        animateGradually: { enabled: false },
        dynamicAnimation: { enabled: true, speed: 500 },
      },
      background: 'transparent',
    },
    colors: SERIES_COLORS,
    grid: { borderColor: PALETTE.grid, strokeDashArray: 3, padding: { left: 6, right: 6 } },
    dataLabels: { enabled: false },
    stroke: { width: 2, curve: 'smooth' },
    legend: {
      position: 'top',
      horizontalAlign: 'left',
      fontSize: '12px',
      fontWeight: 600,
      markers: { size: 5, shape: 'circle' },
      itemMargin: { horizontal: 8 },
    },
    xaxis: {
      type: 'datetime',
      labels: { datetimeUTC: false, style: { fontSize: '11px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
      tooltip: { enabled: false },
    },
    yaxis: { labels: { style: { fontSize: '11px' } } },
    tooltip: { theme: 'light', x: { format: 'dd MMM HH:mm' }, style: { fontFamily: FONT } },
    fill: { opacity: 1 },
  }, overrides);
}

export function sparkline(color) {
  return {
    chart: { type: 'area', sparkline: { enabled: true }, fontFamily: FONT, animations: { enabled: false } },
    stroke: { width: 1.75, curve: 'smooth' },
    colors: [color],
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.28, opacityTo: 0.02, stops: [0, 100] } },
    tooltip: { enabled: false },
  };
}

/**
 * Chart options that keep their identity until their content changes.
 *
 * Options built in a computed() come out as a new object on every refresh
 * (the history array changed, so everything derived from it re-ran), and
 * vue3-apexcharts answers a new options object with updateOptions(): the
 * whole chart re-renders and replays its entry animation once a minute.
 * Comparing a serialised signature (formatters by their source) returns the
 * previous object when nothing changed, so a refresh only animates the data.
 */
export function stableOptions(build) {
  let prev = null;
  let prevSig = null;
  return computed(() => {
    const next = build();
    const sig = JSON.stringify(next, (_, v) => (typeof v === 'function' ? v.toString() : v));
    if (sig === prevSig) return prev;
    prevSig = sig;
    prev = next;
    return next;
  });
}
