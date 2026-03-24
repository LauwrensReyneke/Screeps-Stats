<template>
  <div class="glass relative flex flex-col justify-between overflow-visible px-5 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_20px_42px_rgba(15,23,42,0.08)]">
    <!-- colored top-edge accent line -->
    <div class="absolute inset-x-0 top-0 h-[2px] rounded-t-2xl" :class="accentLine"></div>

    <!-- top row: label + info + icon -->
    <div class="flex items-start justify-between gap-2">
      <div class="flex items-center gap-1.5">
        <span class="text-[10px] font-bold uppercase tracking-widest text-slate-400">{{ label }}</span>
        <div v-if="info" class="group relative">
          <button
            type="button"
            class="flex size-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[9px] font-bold leading-none text-slate-500 transition-colors hover:border-indigo-300 hover:text-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
            aria-label="Metric explanation"
          >i</button>
          <div
            class="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 w-56 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-medium normal-case tracking-normal text-slate-600 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            {{ info }}
          </div>
        </div>
      </div>
      <div v-if="icon" class="flex size-7 items-center justify-center rounded-lg" :class="iconBg">
        <font-awesome-icon :icon="icon" class="text-xs" :class="iconFg" />
      </div>
    </div>

    <!-- value -->
    <div class="mt-3 flex items-baseline gap-1.5">
      <span class="text-[28px] font-black leading-none tabular-nums text-slate-900">{{ displayValue }}</span>
      <span v-if="unit" class="text-xs font-semibold text-slate-400">{{ unit }}</span>
    </div>

    <p v-if="sub" class="mt-1 text-[11px] font-medium text-slate-400">{{ sub }}</p>

    <!-- sparkline -->
    <div v-if="sparkRenderData.length > 1" class="-mx-1 mt-2">
      <ApexChart
        type="area"
        height="52"
        :options="sparkOptions"
        :series="[{ data: sparkRenderData }]"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import ApexChart from 'vue3-apexcharts';

const props = defineProps({
  label:     { type: String,  required: true },
  value:     { type: [Number, String], default: '—' },
  unit:      { type: String,  default: '' },
  sub:       { type: String,  default: '' },
  info:      { type: String,  default: '' },
  color:     { type: String,  default: 'default' },
  decimals:  { type: Number,  default: 0 },
  icon:      { type: [Array, Object, String], default: null },
  sparkData: { type: Array,   default: null },
});

const displayValue = computed(() => {
  if (typeof props.value === 'number') return props.value.toFixed(props.decimals);
  return props.value ?? '—';
});

const COLOR_MAP = {
  success: { line: '#10b981', accent: 'bg-emerald-500', iconBg: 'bg-emerald-500/15', iconFg: 'text-emerald-400' },
  warning: { line: '#f59e0b', accent: 'bg-amber-500',   iconBg: 'bg-amber-500/15',   iconFg: 'text-amber-400' },
  danger:  { line: '#ef4444', accent: 'bg-red-500',     iconBg: 'bg-red-500/15',     iconFg: 'text-red-400' },
  accent:  { line: '#6366f1', accent: 'bg-indigo-500',  iconBg: 'bg-indigo-500/15',  iconFg: 'text-indigo-400' },
  purple:  { line: '#a855f7', accent: 'bg-purple-500',  iconBg: 'bg-purple-500/15',  iconFg: 'text-purple-400' },
  sky:     { line: '#0ea5e9', accent: 'bg-sky-500',     iconBg: 'bg-sky-500/15',     iconFg: 'text-sky-400' },
  default: { line: '#6366f1', accent: 'bg-indigo-500',  iconBg: 'bg-indigo-500/15',  iconFg: 'text-indigo-400' },
};

const cfg = computed(() => COLOR_MAP[props.color] ?? COLOR_MAP.default);

const accentLine = computed(() => cfg.value.accent);
const iconBg     = computed(() => cfg.value.iconBg);
const iconFg     = computed(() => cfg.value.iconFg);

function downsample(values, targetPoints = 56) {
  if (values.length <= targetPoints) return values;

  const bucketSize = values.length / targetPoints;
  const compact = [];

  for (let i = 0; i < targetPoints; i += 1) {
    const start = Math.floor(i * bucketSize);
    const end = Math.min(values.length, Math.floor((i + 1) * bucketSize));
    if (start >= end) continue;

    let sum = 0;
    for (let j = start; j < end; j += 1) sum += values[j];
    compact.push(sum / (end - start));
  }

  return compact.length ? compact : values;
}

const sparkRenderData = computed(() => {
  const values = (props.sparkData || []).map((n) => Number(n) || 0);
  return downsample(values);
});

const yBounds = computed(() => {
  const vals = sparkRenderData.value;
  if (!vals.length) return { min: 0, max: 1 };
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.05, 1);
    return { min: min - pad, max: max + pad };
  }
  const pad = (max - min) * 0.15;
  return { min: min - pad, max: max + pad };
});

const sparkOptions = computed(() => ({
  chart: {
    type: 'area',
    sparkline: { enabled: true },
    animations: { enabled: false },
    background: 'transparent',
    toolbar: { show: false },
  },
  stroke: { curve: 'smooth', width: 2.4 },
  colors: [cfg.value.line],
  fill: {
    type: 'gradient',
    gradient: {
      shade: 'light',
      type: 'vertical',
      opacityFrom: 0.3,
      opacityTo: 0.06,
    },
  },
  yaxis: {
    min: yBounds.value.min,
    max: yBounds.value.max,
    show: false,
  },
  markers: { size: 0 },
  grid: { show: false },
  tooltip: { enabled: false },
}));
</script>
