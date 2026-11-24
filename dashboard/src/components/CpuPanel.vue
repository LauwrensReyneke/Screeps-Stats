<template>
  <Panel title="CPU" :icon="faMicrochip" :subtitle="subtitle">
    <template #info>
      Usage against the limit, the bucket, and where the CPU goes. The bucket
      cycles from 0 to 10,000 when pixels are being generated: that is expected
      while average CPU stays under 85% of the limit.
    </template>
    <template #actions>
      <TabSwitch v-model="tab" :tabs="TABS" />
    </template>

    <!-- Usage -->
    <template v-if="tab === 'usage'">
      <ApexChart v-if="history.length > 1" type="line" height="290" :options="usageOptions" :series="usageSeries" />
      <EmptyChart v-else :height="290" />
    </template>

    <!-- By role -->
    <template v-else-if="tab === 'roles'">
      <div v-if="roleRows.length" class="space-y-4">
        <div>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th class="pb-2">Role</th>
                <th class="pb-2 text-right">Creeps</th>
                <th class="pb-2 text-right">CPU</th>
                <th class="pb-2 text-right">Per creep</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in roleRows" :key="r.role" class="border-t border-slate-100">
                <td class="py-1.5">
                  <div class="flex items-center gap-2">
                    <span class="size-2 rounded-full" :style="{ background: r.color }"></span>
                    <span class="font-semibold text-slate-800">{{ r.role }}</span>
                  </div>
                  <div class="mt-1 h-1 rounded-full bg-slate-100">
                    <div class="h-1 rounded-full" :style="{ width: `${r.share * 100}%`, background: r.color }"></div>
                  </div>
                </td>
                <td class="py-1.5 text-right tabular-nums text-slate-600">{{ r.count.toFixed(0) }}</td>
                <td class="py-1.5 text-right font-bold tabular-nums text-slate-900">{{ r.cpu.toFixed(2) }}</td>
                <td class="py-1.5 text-right tabular-nums" :class="r.cpuPer > 0.3 ? 'font-bold text-amber-600' : 'text-slate-600'">{{ r.cpuPer.toFixed(3) }}</td>
              </tr>
            </tbody>
          </table>
          <p class="mt-2 text-[11px] text-slate-400">
            {{ roleSource }}. One game action costs 0.2 CPU, so ~0.2 per creep is the floor for a creep that acts every tick.
          </p>
        </div>
        <div>
          <ApexChart v-if="roleHistorySeries.length" type="area" height="240" :options="roleHistoryOptions" :series="roleHistorySeries" />
          <EmptyChart v-else :height="120">Per-role history starts with the first snapshot that carries role CPU.</EmptyChart>
        </div>
      </div>
      <EmptyChart v-else :height="290">The bot has not reported per-role CPU yet.</EmptyChart>
    </template>

    <!-- By phase -->
    <template v-else>
      <ApexChart v-if="phaseRows.length" type="bar" :height="Math.max(220, phaseRows.length * 30)" :options="phaseOptions" :series="phaseSeries" />
      <EmptyChart v-else :height="260">No phase data yet.</EmptyChart>
    </template>
  </Panel>
</template>

<script setup>
import { computed } from 'vue';
import ApexChart from 'vue3-apexcharts';
import { faMicrochip } from '@fortawesome/free-solid-svg-icons';
import Panel from './Panel.vue';
import TabSwitch from './TabSwitch.vue';
import EmptyChart from './EmptyChart.vue';
import { base, PALETTE, SERIES_COLORS } from '../lib/apex.js';
import { usePref } from '../lib/prefs.js';

const props = defineProps({
  history: { type: Array, default: () => [] },
  data: { type: Object, default: null },
});

const TABS = [
  { key: 'usage', label: 'Usage' },
  { key: 'roles', label: 'By role' },
  { key: 'phases', label: 'By phase' },
];
const tab = usePref('cpuTab', 'usage');

const limit = computed(() => Number(props.data?.cpu?.limit) || Number(props.history.at(-1)?.cpu_limit) || 20);
const avgCpu = computed(() => {
  const h = props.history;
  return h.length ? h.reduce((s, r) => s + (Number(r.cpu_used) || 0), 0) / h.length : 0;
});
const subtitle = computed(() =>
  props.history.length ? `Averaging ${avgCpu.value.toFixed(2)} of ${limit.value} over the range` : 'Usage, bucket and breakdown');

// Round axis: multiples of 5, with headroom above the limit and the peak.
const cpuAxisMax = computed(() => {
  const peak = Math.max(limit.value * 1.2, ...props.history.map((r) => Number(r.cpu_used) || 0));
  return Math.ceil(peak / 5) * 5;
});

// ── Usage ──────────────────────────────────────────────────────────────────
const usageSeries = computed(() => [
  { name: 'CPU used', type: 'line', data: props.history.map((r) => [r.ts, +Number(r.cpu_used).toFixed(2)]) },
  { name: 'Bucket', type: 'area', data: props.history.map((r) => [r.ts, Math.round(r.cpu_bucket)]) },
]);
const usageOptions = computed(() => base({
  colors: [PALETTE.indigo, PALETTE.sky],
  stroke: { width: [2.5, 1.5] },
  fill: { type: ['solid', 'gradient'], gradient: { opacityFrom: 0.25, opacityTo: 0.02 } },
  yaxis: [
    { min: 0, max: cpuAxisMax.value, tickAmount: cpuAxisMax.value / 5,
      title: { text: 'CPU', style: { fontWeight: 600 } }, labels: { formatter: (v) => v.toFixed(0) } },
    { opposite: true, min: 0, max: 10000, title: { text: 'Bucket', style: { fontWeight: 600 } },
      labels: { formatter: (v) => `${Math.round(v / 1000)}k` } },
  ],
  annotations: {
    yaxis: [
      { y: limit.value, borderColor: PALETTE.rose, strokeDashArray: 4,
        label: { text: `limit ${limit.value}`, borderColor: 'transparent', style: { color: PALETTE.rose, background: 'transparent', fontWeight: 700 } } },
      { y: limit.value * 0.85, borderColor: PALETTE.amber, strokeDashArray: 4,
        label: { text: 'pixel gate', borderColor: 'transparent', style: { color: PALETTE.amber, background: 'transparent', fontWeight: 700 } } },
    ],
  },
  tooltip: { shared: true, y: { formatter: (v, { seriesIndex }) => (seriesIndex === 0 ? v.toFixed(2) : Math.round(v).toLocaleString('en')) } },
}));

// ── By role ────────────────────────────────────────────────────────────────
const historyWithRoles = computed(() => props.history.filter((r) => r.roles_cpu && Object.keys(r.roles_cpu).length));

const roleSource = computed(() => (historyWithRoles.value.length
  ? `Averaged over ${historyWithRoles.value.length} point${historyWithRoles.value.length === 1 ? '' : 's'} in the range`
  : 'Latest sampled tick'));

const roleRows = computed(() => {
  const rows = historyWithRoles.value;
  const acc = {};
  if (rows.length) {
    for (const r of rows) {
      for (const [role, v] of Object.entries(r.roles_cpu)) {
        const a = acc[role] || (acc[role] = { count: 0, cpu: 0 });
        a.count += v.count || 0;
        a.cpu += v.cpu || 0;
      }
    }
    for (const a of Object.values(acc)) { a.count /= rows.length; a.cpu /= rows.length; }
  } else {
    for (const [role, v] of Object.entries(props.data?.roles || {})) acc[role] = { count: v.count, cpu: v.cpu };
  }
  const total = Object.values(acc).reduce((s, a) => s + a.cpu, 0) || 1;
  return Object.entries(acc)
    .map(([role, a]) => ({ role, count: a.count, cpu: a.cpu, cpuPer: a.count ? a.cpu / a.count : 0, share: a.cpu / total }))
    .sort((a, b) => b.cpu - a.cpu)
    .map((r, i) => ({ ...r, color: SERIES_COLORS[i % SERIES_COLORS.length] }));
});

const roleHistorySeries = computed(() => {
  const rows = historyWithRoles.value;
  if (rows.length < 2) return [];
  const top = roleRows.value.slice(0, 7).map((r) => r.role);
  const series = top.map((role) => ({ name: role, data: rows.map((r) => [r.ts, +((r.roles_cpu[role]?.cpu) || 0).toFixed(3)]) }));
  series.push({
    name: 'other',
    data: rows.map((r) => [r.ts, +Object.entries(r.roles_cpu).filter(([k]) => !top.includes(k)).reduce((s, [, v]) => s + (v.cpu || 0), 0).toFixed(3)]),
  });
  return series;
});
const roleHistoryOptions = computed(() => base({
  chart: { stacked: true },
  colors: [...roleRows.value.slice(0, 7).map((r) => r.color), PALETTE.muted],
  stroke: { width: 1 },
  fill: { type: 'gradient', gradient: { opacityFrom: 0.55, opacityTo: 0.25 } },
  // Array form: see ColonyPanel energyOptions (stacked charts lost the
  // formatter on updateOptions with an object y-axis).
  yaxis: [{ labels: { formatter: (v) => v.toFixed(1) }, title: { text: 'CPU', style: { fontWeight: 600 } } }],
  tooltip: { shared: true, y: { formatter: (v) => v.toFixed(3) } },
}));

// ── By phase ───────────────────────────────────────────────────────────────
const phaseRows = computed(() => {
  const withPhases = props.history.filter((r) => r.phases && Object.keys(r.phases).length);
  const acc = {};
  if (withPhases.length) {
    for (const r of withPhases) for (const [k, v] of Object.entries(r.phases)) acc[k] = (acc[k] || 0) + (Number(v) || 0);
    for (const k of Object.keys(acc)) acc[k] /= withPhases.length;
  } else {
    for (const p of props.data?.phases || []) acc[p.name] = Number(p.duration) || 0;
  }
  delete acc.total;
  return Object.entries(acc).map(([name, v]) => ({ name, v })).filter((p) => p.v >= 0.005).sort((a, b) => b.v - a.v);
});
const phaseSeries = computed(() => [{ name: 'CPU', data: phaseRows.value.map((p) => +p.v.toFixed(3)) }]);
const phaseOptions = computed(() => base({
  chart: { type: 'bar' },
  plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '62%', distributed: true } },
  colors: phaseRows.value.map((_, i) => SERIES_COLORS[i % SERIES_COLORS.length]),
  legend: { show: false },
  dataLabels: { enabled: true, formatter: (v) => v.toFixed(2), style: { fontSize: '11px', fontWeight: 700, colors: ['#334155'] }, offsetX: 18 },
  xaxis: { type: 'category', categories: phaseRows.value.map((p) => p.name), labels: { formatter: (v) => Number(v).toFixed(1) } },
  grid: { yaxis: { lines: { show: false } } },
  tooltip: { y: { formatter: (v) => `${v.toFixed(3)} CPU` } },
}));
</script>
