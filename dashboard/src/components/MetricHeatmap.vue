<template>
  <div class="glass relative p-5" ref="rootRef">
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-sm font-bold text-slate-900">{{ title }}</h2>
        <p class="mt-0.5 text-[11px] text-slate-400">{{ activeMetric?.subtitle || subtitle }}</p>
      </div>

      <div v-if="metricEntries.length" class="flex flex-wrap gap-1.5">
        <button
          v-for="metric in metricEntries"
          :key="metric.key"
          class="rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all duration-150"
          :class="activeMetricKey === metric.key
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'"
          @click="setActiveMetric(metric.key)"
        >{{ metric.label }}</button>
      </div>
    </div>

    <div v-if="!cells.length" class="flex h-28 items-center justify-center text-xs italic text-slate-400">
      Collecting data for heatmap.
    </div>

    <template v-else>
      <div class="relative overflow-x-auto pb-1" ref="gridWrapRef">
        <div class="inline-grid grid-flow-col gap-1" :style="{ gridTemplateRows: `repeat(${rowsPerColumn}, minmax(0, 1fr))` }">
          <button
            v-for="cell in cells"
            :key="cell.start"
            class="size-3.5 rounded-[4px] border border-transparent transition-colors duration-150 md:size-4"
            :class="[toneClass(cell.value), isSelectedCell(cell) ? 'ring-2 ring-slate-700/70 ring-offset-1 ring-offset-white' : 'hover:ring-1 hover:ring-slate-300']"
            @mouseenter="onCellEnter(cell, $event)"
            @mouseleave="onCellLeave"
            @focus="onCellEnter(cell, $event)"
            @blur="onCellLeave"
            @click="selectCell(cell)"
          ></button>
        </div>
      </div>

      <div
        v-if="hoveredCell"
        class="pointer-events-none absolute z-30 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-2 text-[10px] shadow-lg backdrop-blur"
        :style="hoverTooltipStyle"
      >
        <p class="font-semibold text-slate-700">{{ hoverRangeLabel }}</p>
        <p class="mt-0.5 text-slate-500">{{ hoverMetricLabel }}: <span class="font-semibold text-slate-700">{{ hoverMetricValue }}</span></p>
      </div>

      <div class="mt-3 flex items-center justify-center gap-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        <span>Low</span>
        <div class="flex items-center gap-1">
          <span
            v-for="(swatch, idx) in legendSwatches"
            :key="`legend-${idx}`"
            class="size-3 rounded-[3px] md:size-3.5"
            :class="swatch"
          ></span>
        </div>
        <span>High</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  title: { type: String, default: 'Heatmap' },
  subtitle: { type: String, default: '' },
  seriesByMetric: { type: Object, default: () => ({}) },
  activeKey: { type: String, default: '' },
  rowsPerColumn: { type: Number, default: 7 },
  selectedCellStart: { type: Number, default: null },
});

const emit = defineEmits(['update:activeKey', 'select-cell']);

const rootRef = ref(null);
const gridWrapRef = ref(null);
const hoveredCell = ref(null);
const hoverAnchor = ref({ x: 0, y: 0, placement: 'top' });

const PALETTES = {
  activity: [
    'bg-slate-100 ring-1 ring-inset ring-slate-200',
    'bg-indigo-100 ring-1 ring-inset ring-indigo-200/80',
    'bg-indigo-200 ring-1 ring-inset ring-indigo-300/80',
    'bg-indigo-300 ring-1 ring-inset ring-indigo-400/80',
    'bg-indigo-500 ring-1 ring-inset ring-indigo-600/70',
  ],
  cpu_stress: [
    'bg-slate-100 ring-1 ring-inset ring-slate-200',
    'bg-amber-100 ring-1 ring-inset ring-amber-200/80',
    'bg-amber-200 ring-1 ring-inset ring-amber-300/80',
    'bg-orange-300 ring-1 ring-inset ring-orange-400/80',
    'bg-rose-500 ring-1 ring-inset ring-rose-600/70',
  ],
  cpu_bucket: [
    'bg-slate-100 ring-1 ring-inset ring-slate-200',
    'bg-sky-100 ring-1 ring-inset ring-sky-200/80',
    'bg-sky-200 ring-1 ring-inset ring-sky-300/80',
    'bg-cyan-300 ring-1 ring-inset ring-cyan-400/80',
    'bg-cyan-500 ring-1 ring-inset ring-cyan-600/70',
  ],
  creeps: [
    'bg-slate-100 ring-1 ring-inset ring-slate-200',
    'bg-emerald-100 ring-1 ring-inset ring-emerald-200/80',
    'bg-emerald-200 ring-1 ring-inset ring-emerald-300/80',
    'bg-teal-300 ring-1 ring-inset ring-teal-400/80',
    'bg-teal-500 ring-1 ring-inset ring-teal-600/70',
  ],
  credits: [
    'bg-slate-100 ring-1 ring-inset ring-slate-200',
    'bg-violet-100 ring-1 ring-inset ring-violet-200/80',
    'bg-violet-200 ring-1 ring-inset ring-violet-300/80',
    'bg-fuchsia-300 ring-1 ring-inset ring-fuchsia-400/80',
    'bg-fuchsia-500 ring-1 ring-inset ring-fuchsia-600/70',
  ],
  threat: [
    'bg-slate-100 ring-1 ring-inset ring-slate-200',
    'bg-red-100 ring-1 ring-inset ring-red-200/80',
    'bg-red-200 ring-1 ring-inset ring-red-300/80',
    'bg-rose-300 ring-1 ring-inset ring-rose-400/80',
    'bg-rose-500 ring-1 ring-inset ring-rose-600/70',
  ],
};

const metricEntries = computed(() =>
  Object.entries(props.seriesByMetric || {}).map(([key, def]) => ({ key, ...(def || {}) }))
);

const activeMetricKey = computed(() => {
  if (props.activeKey && (props.seriesByMetric || {})[props.activeKey]) return props.activeKey;
  return metricEntries.value[0]?.key || '';
});

const activeMetric = computed(() => (activeMetricKey.value ? (props.seriesByMetric || {})[activeMetricKey.value] : null));
const cells = computed(() => activeMetric.value?.cells || []);

const activePalette = computed(() => {
  const key = activeMetric.value?.palette || activeMetricKey.value;
  return PALETTES[key] || PALETTES.activity;
});

const legendSwatches = computed(() => activePalette.value);

const hoverMetricLabel = computed(() => activeMetric.value?.label || 'Metric');
const hoverMetricValue = computed(() => {
  if (!hoveredCell.value) return '';
  return formatMetricValue(hoveredCell.value.value);
});
const hoverRangeLabel = computed(() => {
  if (!hoveredCell.value) return '';
  return formatRange(hoveredCell.value.start, hoveredCell.value.end);
});
const hoverTooltipStyle = computed(() => {
  const rootEl = rootRef.value;
  const rootWidth = rootEl?.clientWidth || 700;

  // Clamp within the heatmap card so tooltip never detaches from the active block.
  const x = Math.max(110, Math.min(rootWidth - 110, hoverAnchor.value.x));
  const y = Math.max(10, hoverAnchor.value.y);

  if (hoverAnchor.value.placement === 'bottom') {
    return {
      left: `${x}px`,
      top: `${y + 8}px`,
      transform: 'translate(-50%, 0)',
    };
  }

  return {
    left: `${x}px`,
    top: `${y - 8}px`,
    transform: 'translate(-50%, -100%)',
  };
});

const quantiles = computed(() => {
  const values = cells.value
    .map((c) => Number(c.value) || 0)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  if (!values.length) return [0, 0, 0, 0];

  const pick = (q) => values[Math.min(values.length - 1, Math.floor((values.length - 1) * q))];
  return [pick(0.25), pick(0.5), pick(0.75), pick(0.95)];
});

function setActiveMetric(key) {
  emit('update:activeKey', key);
}

function toneClass(value) {
  const n = Number(value) || 0;
  if (n <= 0) return activePalette.value[0];

  const [q1, q2, q3, q4] = quantiles.value;
  if (n <= q1) return activePalette.value[1];
  if (n <= q2) return activePalette.value[2];
  if (n <= q3) return activePalette.value[3];
  if (n <= q4) return activePalette.value[4];
  return activePalette.value[4];
}

function formatMetricValue(value) {
  const n = Number(value) || 0;
  const unit = activeMetric.value?.unit || '';

  if (unit === '%') return `${n.toFixed(1)}%`;
  if (unit === 'score') return `${n.toFixed(1)} score`;
  if (unit === 'compact') {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  }

  return n.toFixed(1);
}

function formatRange(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const day = startDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const startTime = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const endTime = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return `${day} ${startTime} - ${endTime}`;
}

function selectCell(cell) {
  emit('select-cell', cell);
}

function onCellEnter(cell, event) {
  const anchor = resolveAnchor(event);
  if (!anchor) {
    hoveredCell.value = null;
    return;
  }

  hoveredCell.value = cell;
  hoverAnchor.value = anchor;
}

function resolveAnchor(event) {
  const target = event?.currentTarget || event?.target;
  const rootEl = rootRef.value;
  if (!target || typeof target.getBoundingClientRect !== 'function' || !rootEl) return null;

  const rect = target.getBoundingClientRect();
  const rootRect = rootEl.getBoundingClientRect();
  const top = rect.top - rootRect.top;
  const bottom = rect.bottom - rootRect.top;
  const placement = top < 84 ? 'bottom' : 'top';

  return {
    x: (rect.left - rootRect.left) + (rect.width / 2),
    y: placement === 'bottom' ? bottom : top,
    placement,
  };
}

function onCellLeave() {
  hoveredCell.value = null;
}

function isSelectedCell(cell) {
  return Number(props.selectedCellStart) === Number(cell.start);
}
</script>

