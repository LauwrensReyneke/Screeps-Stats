<template>
  <Panel title="GCL push" :icon="faArrowUpRightDots" :subtitle="subtitle">
    <template #info>
      GCL grows by the energy spent upgrading controllers. A room that is
      healthy and holds more than its reserve (30K at RCL8, 50K below) goes into
      <b>GCL focus</b>: full-size upgraders, and below RCL8 more of them as the
      excess grows. RCL8 controllers take at most 15 energy a tick, so their
      surplus is shipped to rooms below RCL8. Bars are measured upgrade energy
      per tick, averaged over the range.
    </template>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div v-for="f in facts" :key="f.label" class="rounded-lg bg-slate-50 px-3 py-2">
        <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400">{{ f.label }}</p>
        <p class="text-lg font-extrabold tabular-nums text-slate-900">{{ f.value }}</p>
        <p v-if="f.sub" class="text-[11px] text-slate-500">{{ f.sub }}</p>
      </div>
    </div>

    <ApexChart v-if="reported" class="mt-3" type="bar" :height="Math.max(200, bars.length * 26)" :options="barOptions" :series="barSeries" />
    <EmptyChart v-else :height="160" class="mt-3">Upgrade rates appear once the bot reports them.</EmptyChart>
  </Panel>
</template>

<script setup>
import { computed } from 'vue';
import ApexChart from 'vue3-apexcharts';
import { faArrowUpRightDots } from '@fortawesome/free-solid-svg-icons';
import Panel from './Panel.vue';
import EmptyChart from './EmptyChart.vue';
import { base, PALETTE } from '../lib/apex.js';
import { fmtCompact, fmtDuration } from '../lib/format.js';
import { progressEta, msPerTick } from '../lib/derive.js';

const props = defineProps({
  history: { type: Array, default: () => [] },
  roomSeries: { type: Object, default: () => ({}) },
  rooms: { type: Array, default: () => [] },
});

const gclRows = computed(() => props.history.filter((r) => r.gcl_progress_total > 0));
const eta = computed(() => progressEta(gclRows.value, { progress: 'gcl_progress', total: 'gcl_progress_total', level: 'gcl_level' }));

// GCL points per hour over the range (within the current level).
const perHour = computed(() => {
  if (!eta.value) return null;
  const tickMs = msPerTick(gclRows.value);
  return tickMs ? eta.value.perTick * (3_600_000 / tickMs) : null;
});

// Range-averaged upgrade energy per room; latest value where there is no history yet.
const bars = computed(() => props.rooms
  .filter((r) => r.owned)
  .map((r) => {
    const s = (props.roomSeries[r.name] || []).filter((p) => p.upgrade_per_tick > 0 || p.gcl_focus !== undefined);
    const avg = s.length ? s.reduce((a, p) => a + (p.upgrade_per_tick || 0), 0) / s.length : (r.upgradePerTick || 0);
    return { name: r.name, rcl: r.rcl, focus: !!r.gclFocus, value: +avg.toFixed(1) };
  })
  .sort((a, b) => b.value - a.value));

// The bot reports upgrade energy from the version that measures it onward;
// before that every room reads 0, which is no data rather than no upgrading.
const reported = computed(() => bars.value.some((b) => b.value > 0));

const totalUpgrade = computed(() => props.rooms.filter((r) => r.owned).reduce((s, r) => s + (r.upgradePerTick || 0), 0));
const focused = computed(() => props.rooms.filter((r) => r.owned && r.gclFocus));
const rcl8Headroom = computed(() => props.rooms
  .filter((r) => r.owned && r.rcl >= 8)
  .reduce((s, r) => s + Math.max(0, 15 - (r.upgradePerTick || 0)), 0));

const facts = computed(() => [
  { label: 'GCL / hour', value: perHour.value ? fmtCompact(perHour.value) : '—', sub: 'points, current level' },
  { label: 'Next level', value: eta.value?.msLeft ? fmtDuration(eta.value.msLeft) : '—', sub: eta.value ? `${fmtCompact(eta.value.ticksLeft)} ticks` : '' },
  { label: 'Upgrading', value: reported.value ? `${totalUpgrade.value.toFixed(0)}/tick` : '—', sub: reported.value ? 'energy into controllers now' : 'awaiting the bot to report it' },
  { label: 'In focus', value: `${focused.value.length} rooms`, sub: !reported.value ? '' : (rcl8Headroom.value > 0.5 ? `RCL8 rooms ${rcl8Headroom.value.toFixed(0)}/tick under cap` : 'RCL8 rooms at cap') },
]);

const subtitle = computed(() => (focused.value.length
  ? `${focused.value.map((r) => r.name).join(', ')} spending surplus on the controller`
  : 'No room has energy to spare yet'));

const barSeries = computed(() => [{ name: 'Upgrade energy / tick', data: bars.value.map((b) => b.value) }]);
const barOptions = computed(() => base({
  chart: { type: 'bar' },
  plotOptions: { bar: { horizontal: true, borderRadius: 3, barHeight: '62%', distributed: true } },
  colors: bars.value.map((b) => (b.focus ? PALETTE.violet : PALETTE.muted)),
  legend: { show: false },
  dataLabels: { enabled: true, formatter: (v) => v.toFixed(1), style: { fontSize: '11px', fontWeight: 700, colors: ['#334155'] }, offsetX: 16 },
  xaxis: { type: 'category', categories: bars.value.map((b) => `${b.name} · RCL${b.rcl}`), labels: { formatter: (v) => Math.round(v) } },
  annotations: { xaxis: [{ x: 15, borderColor: PALETTE.amber, strokeDashArray: 4, label: { text: 'RCL8 cap', borderColor: 'transparent', style: { color: PALETTE.amber, background: 'transparent', fontWeight: 700 } } }] },
  grid: { yaxis: { lines: { show: false } } },
  tooltip: { y: { formatter: (v, { dataPointIndex }) => `${v.toFixed(1)} energy/tick${bars.value[dataPointIndex]?.focus ? ' · GCL focus' : ''}` } },
}));
</script>
