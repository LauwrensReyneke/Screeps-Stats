<template>
  <div class="glass p-5">
    <!-- header -->
    <div class="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 class="text-sm font-bold text-slate-900">{{ title }}</h2>
        <p class="mt-0.5 text-[11px] text-slate-400">{{ subtitle }}</p>
      </div>
      <!-- tab pills -->
      <div v-if="tabs.length" class="flex gap-1.5">
        <button
          v-for="t in tabs"
          :key="t.key"
          @click="setActiveTab(t.key)"
          class="rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all duration-150"
          :class="activeTab === t.key
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'"
        >{{ t.label }}</button>
      </div>
    </div>

    <!-- empty -->
    <div v-if="pointCount < 2" class="flex h-48 items-center justify-center text-xs italic text-slate-400">
      Collecting history — need at least two data points.
    </div>

    <!-- chart -->
    <ApexChart
      v-else
      :key="activeTab"
      :type="chartType"
      height="220"
      :options="chartOptions"
      :series="series"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import ApexChart from 'vue3-apexcharts';

const props = defineProps({
  title:    { type: String, default: 'History' },
  subtitle: { type: String, default: '' },
  rows:     { type: Array,  default: () => [] },
  mode:     { type: String, default: 'cpu' },
  tabs:     { type: Array,  default: () => [] },
  activeKey: { type: String, default: '' },
  customSeries: { type: Array, default: () => [] },
  customTimestamps: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:activeKey']);
const activeTab = ref(props.activeKey || props.tabs[0]?.key || props.mode);

watch(() => props.activeKey, (v) => {
  if (v && v !== activeTab.value) activeTab.value = v;
});

watch(() => props.tabs, (tabs) => {
  if (!tabs.length) return;
  if (!tabs.some((t) => t.key === activeTab.value)) {
    const fallback = tabs[0].key;
    activeTab.value = fallback;
    emit('update:activeKey', fallback);
  }
}, { deep: true });

function setActiveTab(key) {
  activeTab.value = key;
  emit('update:activeKey', key);
}

function rollingAvg(arr, window = 7) {
  return arr.map((_, i) => {
    const slice = arr.slice(Math.max(0, i - window + 1), i + 1);
    return parseFloat((slice.reduce((s, v) => s + v, 0) / slice.length).toFixed(3));
  });
}

function maybeSmooth(arr, window) {
  if (!Array.isArray(arr) || arr.length < 3 || window <= 1) return arr;
  return rollingAvg(arr, window);
}

// Compute y-axis min/max with padding so tight-range series render visibly
function yBoundsFor(vals) {
  if (!vals || !vals.length) return { min: undefined, max: undefined };
  const nums = vals.flat().filter((v) => v != null && isFinite(v));
  if (!nums.length) return { min: undefined, max: undefined };
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  if (lo === hi) {
    const pad = Math.max(Math.abs(lo) * 0.02, 1);
    return { min: lo - pad, max: hi + pad };
  }
  const pad = (hi - lo) * 0.12;
  return { min: lo - pad, max: hi + pad };
}

function fmtCredit(v) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(Number(v) || 0);
}

function fmtTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const currentMode = computed(() => (props.tabs.length ? activeTab.value : props.mode));

const categories = computed(() => {
  if (currentMode.value === 'roles' && props.customTimestamps.length) {
    return props.customTimestamps.map((ts) => fmtTime(ts));
  }
  return props.rows.map((r) => fmtTime(r.ts));
});

const rangeSpanMs = computed(() => {
  const ts = currentMode.value === 'roles'
    ? (props.customTimestamps || []).map((v) => Number(v) || 0).filter(Boolean)
    : (props.rows || []).map((r) => Number(r.ts) || 0).filter(Boolean);
  if (ts.length < 2) return 0;
  return Math.max(...ts) - Math.min(...ts);
});

const smoothingWindow = computed(() => {
  const span = rangeSpanMs.value;
  if (span > 24 * 60 * 60 * 1000) return 11;
  if (span > 6 * 60 * 60 * 1000) return 7;
  if (span > 60 * 60 * 1000) return 5;
  return 1;
});

const avgWindow = computed(() => Math.max(7, smoothingWindow.value));

const series = computed(() => {
  const m = currentMode.value;

  if (m === 'roles') {
    return props.customSeries || [];
  }

  if (m === 'cpu') {
    const vals = props.rows.map((r) => Number(r.cpu_used) || 0);
    return [
      { name: 'CPU used', type: 'bar', data: vals },
      { name: `${avgWindow.value}-pt avg`, type: 'line', data: rollingAvg(vals, avgWindow.value) },
    ];
  }

  if (m === 'bucket') {
    const vals = props.rows.map((r) => Number(r.cpu_bucket) || 0);
    return [{ name: 'Bucket', type: 'area', data: maybeSmooth(vals, smoothingWindow.value) }];
  }

  if (m === 'creeps') {
    const vals = props.rows.map((r) => Number(r.total_creeps) || 0);
    return [
      { name: 'Total creeps', type: 'bar', data: vals },
      { name: `${avgWindow.value}-pt avg`, type: 'line', data: rollingAvg(vals, avgWindow.value) },
    ];
  }

  if (m === 'credits') {
    const vals = props.rows.map((r) => Number(r.credits) || 0);
    return [{ name: 'Credits', type: 'area', data: maybeSmooth(vals, smoothingWindow.value) }];
  }

  return [];
});

// All numeric values in the active series (for y-axis bounds)
const seriesValues = computed(() => series.value.flatMap((s) => s.data ?? []));

const COLORS = {
  bar: '#6366f1',
  line: '#10b981',
  area: '#10b981',
  credits: '#0ea5e9',
  roles: ['#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#0ea5e9', '#ef4444', '#14b8a6'],
};

// Top-level chart type for the <apexchart type="..."> binding
const chartType = computed(() => {
  const m = currentMode.value;
  if (m === 'roles') return 'area';
  if (['cpu', 'creeps'].includes(m)) return 'line';
  if (m === 'bucket') return 'area';
  if (m === 'credits') return 'area';
  return 'line';
});

const chartOptions = computed(() => {
  const m = currentMode.value;
  const hasMixed = ['cpu', 'creeps'].includes(m);
  const isCredits = m === 'credits';
  const isRoles = m === 'roles';
  const isBucket = m === 'bucket';

  // For tight-range series (credits, bucket) compute padded y bounds
  const bounds = (isCredits || isBucket) ? yBoundsFor(seriesValues.value) : {};

  return {
    chart: {
      stacked: isRoles,
      background: 'transparent',
      toolbar: { show: false },
      animations: { enabled: false },
      zoom: { enabled: false },
      foreColor: '#64748b',
    },
    colors: hasMixed
      ? [COLORS.bar, COLORS.line]
      : (isRoles ? COLORS.roles : [isCredits ? COLORS.credits : COLORS.area]),
    stroke: {
      curve: 'smooth',
      width: isRoles ? 1 : (hasMixed ? [0, 2] : 2),
    },
    fill: {
      type: isRoles ? 'solid' : (hasMixed ? ['solid', 'solid'] : 'gradient'),
      opacity: isRoles ? 0.78 : undefined,
      gradient: isRoles ? undefined : {
        shade: 'light',
        type: 'vertical',
        opacityFrom: isCredits ? 0.18 : 0.2,
        opacityTo: 0.02,
      },
    },
    markers: {
      size: 0,
      strokeWidth: 0,
      hover: { sizeOffset: 3 },
    },
    plotOptions: {
      bar: { columnWidth: '55%', borderRadius: 3 },
    },
    dataLabels: { enabled: false },
    xaxis: {
      categories: categories.value,
      tickAmount: 6,
      labels: {
        style: { colors: '#94a3b8', fontSize: '11px' },
        rotate: 0,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      min: isRoles ? 0 : bounds.min,
      max: isRoles ? undefined : bounds.max,
      forceNiceScale: isRoles || !(isCredits || isBucket),
      labels: {
        style: { colors: '#94a3b8', fontSize: '11px' },
        formatter: (v) => {
          if (isCredits) return fmtCredit(v);
          if (isBucket) return Math.round(v).toLocaleString();
          if (isRoles) return Math.round(v).toString();
          return parseFloat(v.toFixed(2));
        },
      },
    },
    grid: {
      borderColor: '#e2e8f0',
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
    },
    tooltip: {
      theme: 'light',
      x: { show: true },
      y: {
        formatter: isCredits
          ? (val) => fmtCredit(val)
          : isRoles
            ? (val) => `${Math.round(val)}`
            : undefined,
      },
      ...(isRoles && {
        custom({ series, dataPointIndex, w }) {
          const time = w.globals.categoryLabels?.[dataPointIndex] ?? w.globals.labels?.[dataPointIndex] ?? '';
          const total = series.reduce((s, sr) => s + (Number(sr[dataPointIndex]) || 0), 0);
          const rows = w.globals.seriesNames
            .map((name, i) => {
              const val = series[i][dataPointIndex];
              if (!val) return '';
              const color = w.globals.colors[i];
              return `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span>
                <span style="color:#64748b">${name}:</span>
                <strong style="color:#0f172a">${Math.round(val)}</strong>
              </div>`;
            })
            .filter(Boolean)
            .join('');
          return `<div style="padding:10px 14px;font-size:12px;font-family:inherit;min-width:140px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 12px 30px rgba(15,23,42,0.08)">
            <div style="font-weight:700;color:#0f172a;margin-bottom:6px">${time}</div>
            ${rows}
            <div style="border-top:1px solid #e2e8f0;margin-top:6px;padding-top:6px;display:flex;justify-content:space-between">
              <span style="color:#64748b">Total:</span>
              <strong style="color:#4338ca">${total}</strong>
            </div>
          </div>`;
        },
      }),
    },
    legend: {
      show: hasMixed || isRoles,
      position: 'bottom',
      labels: { colors: '#64748b' },
      markers: { size: 5, shape: 'circle' },
      itemMargin: { horizontal: 8 },
    },
  };
});

const pointCount = computed(() => {
  if (currentMode.value === 'roles') return props.customTimestamps.length;
  return props.rows.length;
});
</script>

