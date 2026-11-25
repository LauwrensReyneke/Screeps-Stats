<template>
  <Panel title="GCL push" :icon="faArrowUpRightDots" :subtitle="subtitle">
    <template #info>
      GCL grows by controller progress, and the goal is to bring <b>next level</b> down.
      Progress is energy times boost: an upgrader boosted with XGH2O makes two
      progress per energy (GH2O 1.8, GH 1.5). RCL8 controllers take at most 15
      a tick, so the uncapped RCL7 rooms are where boosts and surplus energy pay.
      A healthy room above its reserve (30K at RCL8, 50K below) goes into
      <b>GCL focus</b> and spends the excess on its controller.
    </template>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <div v-for="f in facts" :key="f.label" class="rounded-lg bg-slate-50 px-3 py-2">
        <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400">{{ f.label }}</p>
        <div class="tick-stack">
          <Transition name="tick">
            <p :key="f.value" class="text-lg font-extrabold tabular-nums" :class="f.tone || 'text-slate-900'">{{ f.value }}</p>
          </Transition>
        </div>
        <p v-if="f.sub" class="truncate text-[11px] text-slate-500" :title="f.sub">{{ f.sub }}</p>
      </div>
    </div>

    <div class="mt-4 grid gap-5 xl:grid-cols-5">
      <div class="xl:col-span-2">
        <div class="flex items-baseline justify-between">
          <h3 class="text-sm font-bold text-slate-900">Time to next level</h3>
          <span class="text-[11px] font-semibold text-slate-400">lower is better</span>
        </div>
        <ApexChart v-if="trend.eta.length > 1" type="area" height="250" :options="etaOptions" :series="etaSeries" />
        <EmptyChart v-else :height="250">Needs a few more points in this range.</EmptyChart>
      </div>
      <div class="xl:col-span-3">
        <div class="flex items-baseline justify-between">
          <h3 class="text-sm font-bold text-slate-900">Controller progress per room</h3>
          <div class="flex items-center gap-3 text-[11px] font-semibold text-slate-500">
            <span class="inline-flex items-center gap-1"><span class="size-2 rounded-full" :style="{ background: PALETTE.violet }"></span>GCL focus</span>
            <span class="inline-flex items-center gap-1"><span class="size-2 rounded-full" :style="{ background: PALETTE.emerald }"></span>boosted</span>
            <span class="inline-flex items-center gap-1"><span class="size-2 rounded-full" :style="{ background: BAR_PLAIN }"></span>other</span>
          </div>
        </div>
        <ApexChart v-if="reported" type="bar" :height="Math.max(230, bars.length * 24 + 40)" :options="barOptions" :series="barSeries" />
        <EmptyChart v-else :height="230">Upgrade rates appear once the bot reports them.</EmptyChart>
      </div>
    </div>
  </Panel>
</template>

<script setup>
import { computed } from 'vue';
import ApexChart from 'vue3-apexcharts';
import { faArrowUpRightDots } from '@fortawesome/free-solid-svg-icons';
import Panel from './Panel.vue';
import EmptyChart from './EmptyChart.vue';
import { base, PALETTE, stableOptions } from '../lib/apex.js';
import { fmtCompact, fmtDuration, fmtInt } from '../lib/format.js';
import { progressEta, msPerTick, etaTrend } from '../lib/derive.js';

const props = defineProps({
  history: { type: Array, default: () => [] },
  roomSeries: { type: Object, default: () => ({}) },
  rooms: { type: Array, default: () => [] },
});

const BAR_PLAIN = '#a5b4c8';
const KEYS = { progress: 'gcl_progress', total: 'gcl_progress_total', level: 'gcl_level' };

const gclRows = computed(() => props.history.filter((r) => r.gcl_progress_total > 0));
const eta = computed(() => progressEta(gclRows.value, KEYS));
const trend = computed(() => etaTrend(gclRows.value, KEYS));

// GCL points per hour over the range (within the current level).
const perHour = computed(() => {
  if (!eta.value) return null;
  const tickMs = msPerTick(gclRows.value);
  return tickMs ? eta.value.perTick * (3_600_000 / tickMs) : null;
});

// Change in the ETA across the range: the number this panel exists to shrink.
const etaChange = computed(() => {
  const e = trend.value.eta;
  if (e.length < 2) return null;
  return e.at(-1)[1] - e[0][1];
});

const owned = computed(() => props.rooms.filter((r) => r.owned));

// Range-averaged upgrade energy per room; latest value where there is no history yet.
const bars = computed(() => owned.value
  .map((r) => {
    const s = (props.roomSeries[r.name] || []).filter((p) => p.upgrade_per_tick > 0 || p.gcl_focus !== undefined);
    const avg = s.length ? s.reduce((a, p) => a + (p.upgrade_per_tick || 0), 0) / s.length : (r.upgradePerTick || 0);
    return {
      name: r.name, rcl: r.rcl, focus: !!r.gclFocus, boosted: r.boostedWork > 0,
      boostShare: r.upgradeWork ? r.boostedWork / r.upgradeWork : 0,
      value: +avg.toFixed(1),
    };
  })
  .sort((a, b) => b.value - a.value));

// The bot reports upgrade energy from the version that measures it onward;
// before that every room reads 0, which is no data rather than no upgrading.
const reported = computed(() => bars.value.some((b) => b.value > 0));

const totalUpgrade = computed(() => owned.value.reduce((s, r) => s + (r.upgradePerTick || 0), 0));
const focused = computed(() => owned.value.filter((r) => r.gclFocus));
const work = computed(() => owned.value.reduce((s, r) => s + (r.upgradeWork || 0), 0));
const boostedWork = computed(() => owned.value.reduce((s, r) => s + (r.boostedWork || 0), 0));
const boostStock = computed(() => owned.value.reduce((s, r) => s + (r.boostStock || 0), 0));
const boostLabs = computed(() => owned.value.filter((r) => r.boostLab).length);
const boostReported = computed(() => owned.value.some((r) => r.upgradeWork > 0 || r.boostLab));

const facts = computed(() => [
  {
    label: 'Next level',
    value: eta.value?.msLeft ? fmtDuration(eta.value.msLeft) : '—',
    sub: etaChange.value === null || Math.abs(etaChange.value) < 0.05
      ? (eta.value ? `${fmtCompact(eta.value.ticksLeft)} ticks · steady` : '')
      : `${etaChange.value < 0 ? '▼' : '▲'} ${Math.abs(etaChange.value).toFixed(1)} days over the range`,
    tone: etaChange.value !== null && etaChange.value < -0.05 ? 'text-emerald-600' : null,
  },
  { label: 'GCL / hour', value: perHour.value ? fmtCompact(perHour.value) : '—', sub: eta.value ? `${eta.value.perTick.toFixed(1)} progress/tick` : 'points, current level' },
  { label: 'Upgrading', value: reported.value ? `${totalUpgrade.value.toFixed(0)}/tick` : '—', sub: reported.value ? 'energy into controllers now' : 'awaiting the bot' },
  {
    label: 'Boosted',
    value: boostReported.value ? `${work.value ? Math.round((boostedWork.value / work.value) * 100) : 0}%` : '—',
    sub: boostReported.value
      ? `${fmtInt(boostedWork.value)}/${fmtInt(work.value)} WORK · ${fmtCompact(boostStock.value)} in stock · ${boostLabs.value} lab${boostLabs.value === 1 ? '' : 's'}`
      : 'awaiting the bot',
    tone: boostedWork.value > 0 ? 'text-emerald-600' : null,
  },
  { label: 'In focus', value: `${focused.value.length} room${focused.value.length === 1 ? '' : 's'}`, sub: focused.value.map((r) => r.name).join(', ') || 'none above reserve' },
]);

const subtitle = computed(() => {
  const n = focused.value.length;
  const focus = n ? `${n} room${n === 1 ? '' : 's'} in GCL focus` : 'No room above its reserve';
  return boostReported.value ? `${focus} · ${fmtInt(boostedWork.value)} boosted WORK` : focus;
});

// ── Time to next level ─────────────────────────────────────────────────────
const etaSeries = computed(() => [{ name: 'Days to next level', data: trend.value.eta }]);
const etaOptions = stableOptions(() => base({
  colors: [PALETTE.violet],
  stroke: { width: 2.5 },
  fill: { type: 'gradient', gradient: { opacityFrom: 0.28, opacityTo: 0.02 } },
  legend: { show: false },
  yaxis: [{ labels: { formatter: (v) => `${v.toFixed(v < 10 ? 1 : 0)}d` } }],
  tooltip: {
    y: {
      formatter: (v, { dataPointIndex }) => {
        const ph = trend.value.perHour[dataPointIndex];
        return `${v.toFixed(1)} days${ph ? ` · ${fmtCompact(ph[1])}/hour` : ''}`;
      },
    },
  },
}));

// ── Per room ───────────────────────────────────────────────────────────────
const barSeries = computed(() => [{ name: 'Upgrade energy / tick', data: bars.value.map((b) => b.value) }]);
const barOptions = stableOptions(() => base({
  chart: { type: 'bar' },
  plotOptions: { bar: { horizontal: true, borderRadius: 4, borderRadiusApplication: 'end', barHeight: '64%', distributed: true, dataLabels: { position: 'top' } } },
  colors: bars.value.map((b) => (b.focus ? PALETTE.violet : b.boosted ? PALETTE.emerald : BAR_PLAIN)),
  legend: { show: false },
  dataLabels: {
    enabled: true,
    offsetX: 22,
    formatter: (v) => v.toFixed(1),
    style: { fontSize: '11px', fontWeight: 700, colors: ['#334155'] },
  },
  xaxis: { type: 'category', categories: bars.value.map((b) => `${b.name} · ${b.rcl}`), labels: { formatter: (v) => Math.round(v) } },
  yaxis: [{ labels: { style: { fontSize: '11px', fontWeight: 600 } } }],
  annotations: {
    xaxis: [{
      x: 15, borderColor: PALETTE.amber, strokeDashArray: 4,
      label: {
        text: 'RCL8 cap', orientation: 'horizontal', position: 'top', offsetY: -8,
        borderColor: 'transparent', style: { color: PALETTE.amber, background: 'transparent', fontWeight: 700, fontSize: '11px' },
      },
    }],
  },
  grid: { yaxis: { lines: { show: false } }, padding: { top: 16, right: 30 } },
  tooltip: {
    y: {
      formatter: (v, { dataPointIndex }) => {
        const b = bars.value[dataPointIndex];
        if (!b) return `${v.toFixed(1)} energy/tick`;
        const tags = [b.focus && 'GCL focus', b.boosted && `${Math.round(b.boostShare * 100)}% boosted`].filter(Boolean);
        return `${v.toFixed(1)} energy/tick${tags.length ? ` · ${tags.join(' · ')}` : ''}`;
      },
    },
  },
}));
</script>
