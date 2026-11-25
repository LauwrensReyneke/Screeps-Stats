<template>
  <!-- No overflow-hidden here: it would clip the info popover. The sparkline
       clips itself to the card's bottom corners instead. -->
  <div class="card card-lift flex min-w-0 flex-col justify-between px-4 pb-2 pt-4">
    <div class="flex items-center justify-between gap-2">
      <div class="flex min-w-0 items-center gap-1.5">
        <span class="truncate text-xs font-bold uppercase tracking-wider text-slate-500">{{ label }}</span>
        <InfoPopover v-if="info" :label="`About ${label}`">{{ info }}</InfoPopover>
      </div>
      <span class="flex size-8 shrink-0 items-center justify-center rounded-lg" :class="tone.iconBox">
        <font-awesome-icon :icon="icon" class="text-sm" :class="tone.icon" />
      </span>
    </div>

    <div class="mt-2 flex items-baseline gap-1.5">
      <span class="tick-stack">
        <Transition name="tick">
          <span :key="value" class="text-[26px] font-extrabold leading-none tabular-nums text-slate-900">{{ value }}</span>
        </Transition>
      </span>
      <span v-if="unit" class="text-sm font-semibold text-slate-400">{{ unit }}</span>
    </div>

    <div class="mt-1.5 flex min-h-[18px] flex-wrap items-center gap-x-2 text-xs">
      <span v-if="delta" class="inline-flex items-center gap-1 font-bold" :class="deltaClass">
        <font-awesome-icon :icon="deltaIcon" class="text-[9px]" />{{ delta.text }}
      </span>
      <span v-if="sub" class="truncate font-medium text-slate-500" :title="sub">{{ sub }}</span>
    </div>

    <div class="-mx-4 -mb-2 mt-1 h-12 overflow-hidden rounded-b-xl">
      <ApexChart v-if="sparkSeries.length > 1" type="area" height="40" :options="sparkOptions" :series="[{ name: label, data: sparkSeries }]" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import ApexChart from 'vue3-apexcharts';
import { faArrowTrendUp, faArrowTrendDown, faMinus } from '@fortawesome/free-solid-svg-icons';
import InfoPopover from './InfoPopover.vue';
import { sparkline, PALETTE } from '../lib/apex.js';

const props = defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: '—' },
  unit: { type: String, default: '' },
  sub: { type: String, default: '' },
  info: { type: String, default: '' },
  icon: { type: [Object, Array], required: true },
  tone: { type: String, default: 'indigo' },
  // { text, direction: 'up'|'down'|'flat', good: true|false|null }
  delta: { type: Object, default: null },
  spark: { type: Array, default: () => [] },
});

const TONES = {
  indigo: { iconBox: 'bg-indigo-50', icon: 'text-indigo-500', line: PALETTE.indigo },
  emerald: { iconBox: 'bg-emerald-50', icon: 'text-emerald-500', line: PALETTE.emerald },
  amber: { iconBox: 'bg-amber-50', icon: 'text-amber-500', line: PALETTE.amber },
  rose: { iconBox: 'bg-rose-50', icon: 'text-rose-500', line: PALETTE.rose },
  sky: { iconBox: 'bg-sky-50', icon: 'text-sky-500', line: PALETTE.sky },
  violet: { iconBox: 'bg-violet-50', icon: 'text-violet-500', line: PALETTE.violet },
};

const tone = computed(() => TONES[props.tone] || TONES.indigo);
const sparkOptions = computed(() => sparkline(tone.value.line));

// At most ~60 points: a sparkline is a shape, not a dataset.
const sparkSeries = computed(() => {
  const v = (props.spark || []).filter((x) => Number.isFinite(Number(x))).map(Number);
  if (v.length <= 60) return v;
  const step = v.length / 60;
  return Array.from({ length: 60 }, (_, i) => v[Math.floor(i * step)]);
});

const deltaIcon = computed(() => ({ up: faArrowTrendUp, down: faArrowTrendDown }[props.delta?.direction] || faMinus));
const deltaClass = computed(() => {
  if (!props.delta || props.delta.good === null || props.delta.good === undefined) return 'text-slate-500';
  return props.delta.good ? 'text-emerald-600' : 'text-rose-600';
});
</script>
