<template>
  <Panel title="Colony" :icon="faCity" :subtitle="subtitle">
    <template #info>
      Stored energy is storage plus terminal in owned rooms, the buffer the
      economy runs on. GCL is account-wide controller progress; its ETA comes
      from the rate across the selected range.
    </template>
    <template #actions>
      <TabSwitch v-model="tab" :tabs="TABS" />
    </template>

    <template v-if="tab === 'energy'">
      <ApexChart v-if="energySeries.length" type="area" height="300" :options="energyOptions" :series="energySeries" />
      <EmptyChart v-else :height="300" />
    </template>

    <template v-else-if="tab === 'population'">
      <ApexChart v-if="populationSeries.length" type="area" height="300" :options="populationOptions" :series="populationSeries" />
      <EmptyChart v-else :height="300" />
    </template>

    <template v-else-if="tab === 'credits'">
      <ApexChart v-if="history.length > 1" type="area" height="300" :options="creditOptions" :series="creditSeries" />
      <EmptyChart v-else :height="300" />
    </template>

    <template v-else>
      <ApexChart v-if="gclRows.length > 1" type="area" height="300" :options="gclOptions" :series="gclSeries" />
      <EmptyChart v-else :height="300" />
    </template>
  </Panel>
</template>

<script setup>
import { computed } from 'vue';
import ApexChart from 'vue3-apexcharts';
import { faCity } from '@fortawesome/free-solid-svg-icons';
import Panel from './Panel.vue';
import TabSwitch from './TabSwitch.vue';
import EmptyChart from './EmptyChart.vue';
import { base, PALETTE } from '../lib/apex.js';
import { fmtCompact, fmtDuration, fmtSigned } from '../lib/format.js';
import { progressEta } from '../lib/derive.js';
import { usePref } from '../lib/prefs.js';

const props = defineProps({
  history: { type: Array, default: () => [] },
  roomSeries: { type: Object, default: () => ({}) },
  ownedRooms: { type: Array, default: () => [] },
});

const TABS = [
  { key: 'energy', label: 'Stored energy' },
  { key: 'population', label: 'Population' },
  { key: 'credits', label: 'Credits' },
  { key: 'gcl', label: 'GCL' },
];
const tab = usePref('colonyTab', 'energy');

const gclRows = computed(() => props.history.filter((r) => r.gcl_progress_total > 0));
const gclEta = computed(() => progressEta(gclRows.value, { progress: 'gcl_progress', total: 'gcl_progress_total', level: 'gcl_level' }));

const subtitle = computed(() => {
  if (tab.value === 'credits' && props.history.length > 1) {
    const d = props.history.at(-1).credits - props.history[0].credits;
    return `${fmtSigned(d)} credits over the range`;
  }
  if (tab.value === 'gcl') {
    const last = gclRows.value.at(-1);
    if (!last) return 'Global control level';
    return `GCL ${last.gcl_level} · next level in ${gclEta.value ? fmtDuration(gclEta.value.msLeft) : '—'}`;
  }
  if (tab.value === 'energy') {
    const total = energyTotals.value;
    if (total.length > 1) return `${fmtCompact(total.at(-1)[1])} stored · ${fmtSigned(total.at(-1)[1] - total[0][1])} over the range`;
  }
  return 'Energy, population, credits and GCL';
});

// Series per owned room, aligned on bucket start so stacking lines up.
function alignedRoomSeries(valueFn) {
  const owned = new Set(props.ownedRooms);
  const names = Object.keys(props.roomSeries).filter((n) => owned.has(n)).sort();
  const buckets = [...new Set(names.flatMap((n) => props.roomSeries[n].map((p) => p.bucket)))].sort((a, b) => a - b);
  return names.map((name) => {
    const byBucket = new Map(props.roomSeries[name].map((p) => [p.bucket, p]));
    return { name, data: buckets.map((b) => [b, byBucket.has(b) ? valueFn(byBucket.get(b)) : null]) };
  });
}

const energySeries = computed(() => alignedRoomSeries((p) => Math.round((p.storage_energy || 0) + (p.terminal_energy || 0))));
const energyTotals = computed(() => {
  const s = energySeries.value;
  if (!s.length) return [];
  return s[0].data.map(([t], i) => [t, s.reduce((sum, r) => sum + (r.data[i][1] || 0), 0)]);
});
const energyOptions = computed(() => base({
  chart: { stacked: true },
  stroke: { width: 1 },
  fill: { type: 'gradient', gradient: { opacityFrom: 0.5, opacityTo: 0.2 } },
  yaxis: { labels: { formatter: (v) => fmtCompact(v) } },
  tooltip: { shared: true, y: { formatter: (v) => (v === null ? '—' : fmtCompact(v, 2)) } },
  legend: { show: energySeries.value.length <= 14 },
}));

const populationSeries = computed(() => {
  const names = Object.keys(props.roomSeries);
  const buckets = [...new Set(names.flatMap((n) => props.roomSeries[n].map((p) => p.bucket)))].sort((a, b) => a - b);
  const totals = {};
  const perBucket = buckets.map((b) => {
    const roles = {};
    for (const n of names) {
      const p = props.roomSeries[n].find((x) => x.bucket === b);
      for (const [role, c] of Object.entries(p?.roles || {})) {
        roles[role] = (roles[role] || 0) + (Number(c) || 0);
        totals[role] = (totals[role] || 0) + (Number(c) || 0);
      }
    }
    return roles;
  });
  const top = Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([r]) => r).slice(0, 8);
  return top.map((role) => ({ name: role, data: buckets.map((b, i) => [b, perBucket[i][role] || 0]) }));
});
const populationOptions = computed(() => base({
  chart: { stacked: true },
  stroke: { width: 1 },
  fill: { type: 'gradient', gradient: { opacityFrom: 0.5, opacityTo: 0.2 } },
  yaxis: { labels: { formatter: (v) => Math.round(v) } },
  tooltip: { shared: true },
}));

const creditSeries = computed(() => [{ name: 'Credits', data: props.history.map((r) => [r.ts, Math.round(r.credits)]) }]);
const creditOptions = computed(() => base({
  colors: [PALETTE.emerald],
  fill: { type: 'gradient', gradient: { opacityFrom: 0.3, opacityTo: 0.02 } },
  yaxis: { labels: { formatter: (v) => fmtCompact(v) } },
  tooltip: { y: { formatter: (v) => fmtCompact(v, 2) } },
}));

const gclSeries = computed(() => [{
  name: 'Progress to next level',
  data: gclRows.value.map((r) => [r.ts, +((r.gcl_progress / r.gcl_progress_total) * 100).toFixed(2)]),
}]);
const gclOptions = computed(() => base({
  colors: [PALETTE.violet],
  fill: { type: 'gradient', gradient: { opacityFrom: 0.3, opacityTo: 0.02 } },
  yaxis: { min: 0, max: 100, labels: { formatter: (v) => `${Math.round(v)}%` } },
  tooltip: { y: { formatter: (v) => `${v.toFixed(2)}%` } },
}));

</script>
