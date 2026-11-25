<template>
  <TransitionRoot :show="open" as="template">
    <Dialog as="div" class="relative z-40" :initialFocus="closeButton" @close="$emit('close')">
      <TransitionChild as="template" enter="ease-out duration-200" enter-from="opacity-0" enter-to="opacity-100" leave="ease-in duration-150" leave-from="opacity-100" leave-to="opacity-0">
        <div class="fixed inset-0 bg-slate-900/25 backdrop-blur-[2px]" />
      </TransitionChild>

      <div class="fixed inset-0 overflow-hidden">
        <div class="absolute inset-y-0 right-0 flex max-w-full pl-10">
          <TransitionChild as="template" enter="transform transition ease-out duration-250" enter-from="translate-x-full" enter-to="translate-x-0" leave="transform transition ease-in duration-200" leave-from="translate-x-0" leave-to="translate-x-full">
            <DialogPanel class="flex w-screen max-w-2xl flex-col bg-slate-50 shadow-2xl">
              <template v-if="room">
                <!-- header -->
                <div class="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
                  <div>
                    <DialogTitle class="flex items-center gap-2 text-lg font-extrabold text-slate-900">
                      {{ room.name }}
                      <span v-if="room.owned && room.rcl" class="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-extrabold text-indigo-700">RCL {{ room.rcl }}</span>
                      <span v-if="!room.owned" class="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">remote</span>
                    </DialogTitle>
                    <p class="text-xs text-slate-500">{{ room.shard }} · {{ series.length }} points in range</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <a :href="`https://screeps.com/a/#!/room/${room.shard}/${room.name}`" target="_blank" rel="noopener"
                       class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-slate-300 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
                      Open in game <font-awesome-icon :icon="faArrowUpRightFromSquare" class="text-[10px]" />
                    </a>
                    <button ref="closeButton" type="button" class="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300" aria-label="Close" @click="$emit('close')">
                      <font-awesome-icon :icon="faXmark" />
                    </button>
                  </div>
                </div>

                <div class="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                  <!-- distress -->
                  <div v-if="room.distress?.length" class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                    <p class="text-sm font-bold text-rose-700"><font-awesome-icon :icon="faHeartPulse" class="mr-1.5" />Distressed</p>
                    <ul class="mt-1 list-inside list-disc text-sm text-rose-700/90">
                      <li v-for="d in room.distress" :key="d">{{ d }}</li>
                    </ul>
                  </div>

                  <!-- facts -->
                  <dl class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div v-for="f in facts" :key="f.label" class="card px-3 py-2.5">
                      <dt class="text-[11px] font-bold uppercase tracking-wider text-slate-400">{{ f.label }}</dt>
                      <dd class="mt-0.5 text-lg font-extrabold tabular-nums text-slate-900">{{ f.value }}</dd>
                      <dd v-if="f.sub" class="text-[11px] text-slate-500">{{ f.sub }}</dd>
                    </div>
                  </dl>

                  <!-- charts -->
                  <div class="card px-4 pt-3">
                    <div class="flex items-center justify-between">
                      <h3 class="text-sm font-bold text-slate-900">{{ CHARTS.find((c) => c.key === chart).label }}</h3>
                      <TabSwitch v-model="chart" :tabs="CHARTS" />
                    </div>
                    <Transition name="fade" mode="out-in">
                      <ApexChart v-if="series.length > 1" :key="chart" type="area" height="240" :options="chartOptions" :series="chartSeries" />
                      <EmptyChart v-else :height="240" class="mb-4" />
                    </Transition>
                  </div>

                  <!-- population -->
                  <div v-if="roleEntries.length" class="card px-4 py-3">
                    <h3 class="text-sm font-bold text-slate-900">Creeps by role</h3>
                    <ApexChart type="bar" :height="Math.max(140, roleEntries.length * 26)" :options="roleOptions" :series="roleSeries" />
                  </div>
                </div>
              </template>
            </DialogPanel>
          </TransitionChild>
        </div>
      </div>
    </Dialog>
  </TransitionRoot>
</template>

<script setup>
import { computed, ref } from 'vue';
import ApexChart from 'vue3-apexcharts';
import { Dialog, DialogPanel, DialogTitle, TransitionRoot, TransitionChild } from '@headlessui/vue';
import { faArrowUpRightFromSquare, faXmark, faHeartPulse } from '@fortawesome/free-solid-svg-icons';
import TabSwitch from './TabSwitch.vue';
import EmptyChart from './EmptyChart.vue';
import { base, PALETTE, stableOptions } from '../lib/apex.js';
import { fmtCompact, fmtDuration, fmtInt } from '../lib/format.js';
import { progressEta, storedEnergy, CONTROLLER_DOWNGRADE } from '../lib/derive.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  room: { type: Object, default: null },
  series: { type: Array, default: () => [] },
});
defineEmits(['close']);

const CHARTS = [
  { key: 'stored', label: 'Stored energy' },
  { key: 'fill', label: 'Spawn energy' },
  { key: 'controller', label: 'Controller' },
  { key: 'cpu', label: 'CPU' },
];
const chart = ref('stored');
const closeButton = ref(null);

const eta = computed(() => progressEta(props.series, { progress: 'controller_progress', total: 'controller_progress_total', level: 'rcl' }));

const facts = computed(() => {
  const r = props.room;
  if (!r) return [];
  const out = [
    { label: 'Stored', value: fmtCompact(storedEnergy(r)), sub: `storage ${fmtCompact(r.storageEnergy)} · terminal ${fmtCompact(r.terminalEnergy)}` },
    { label: 'Spawn energy', value: r.energyCapacity ? `${Math.round((r.energy / r.energyCapacity) * 100)}%` : '—', sub: `${fmtInt(r.energy)} / ${fmtInt(r.energyCapacity)}` },
    { label: 'Creeps', value: fmtInt(r.creeps), sub: `${r.spawns} spawn${r.spawns === 1 ? '' : 's'}` },
  ];
  if (r.owned && r.rcl) {
    out.push({
      label: 'Next RCL',
      value: r.rcl >= 8 ? 'max' : (eta.value?.msLeft ? fmtDuration(eta.value.msLeft) : '—'),
      sub: r.controllerProgressTotal ? `${Math.round((r.controllerProgress / r.controllerProgressTotal) * 100)}% of ${fmtCompact(r.controllerProgressTotal)}` : '',
    });
    const full = CONTROLLER_DOWNGRADE[r.rcl];
    out.push({ label: 'Downgrade timer', value: fmtCompact(r.ticksToDowngrade), sub: full ? `${Math.round((r.ticksToDowngrade / full) * 100)}% of full` : '' });
  }
  if (r.towerCount > 0) {
    const avg = r.towerEnergy / r.towerCount;
    out.push({ label: 'Towers', value: `${Math.round((avg / 1000) * 100)}%`, sub: `${fmtInt(r.towerEnergy)} energy in ${r.towerCount}` });
  }
  if (r.owned) {
    out.push({ label: 'Upgrading', value: r.upgradePerTick ? `${r.upgradePerTick.toFixed(1)}/tick` : '—', sub: r.gclFocus ? 'GCL focus' : (r.policy || '') });
    if (r.upgradeWork > 0 || r.boostLab) {
      out.push({
        label: 'Boosted',
        value: r.upgradeWork ? `${Math.round((r.boostedWork / r.upgradeWork) * 100)}%` : '—',
        sub: `${r.boostedWork}/${r.upgradeWork} WORK · ${fmtCompact(r.boostStock)} compound${r.boostLab ? '' : ' · no boost lab'}`,
      });
    }
  }
  out.push({ label: 'Room CPU', value: r.cpuTotal ? r.cpuTotal.toFixed(2) : '—', sub: r.safeModeAvailable ? `${r.safeModeAvailable} safe modes` : '' });
  return out;
});

const chartSeries = computed(() => {
  const s = props.series;
  switch (chart.value) {
    case 'stored':
      return [
        { name: 'Storage', data: s.map((p) => [p.ts, Math.round(p.storage_energy || 0)]) },
        { name: 'Terminal', data: s.map((p) => [p.ts, Math.round(p.terminal_energy || 0)]) },
      ];
    case 'fill':
      return [{ name: 'Spawn energy', data: s.map((p) => [p.ts, p.energy_cap ? +((p.energy / p.energy_cap) * 100).toFixed(1) : 0]) }];
    case 'controller':
      return [{ name: 'Progress', data: s.map((p) => [p.ts, p.controller_progress_total ? +((p.controller_progress / p.controller_progress_total) * 100).toFixed(2) : 100]) }];
    default:
      return [{ name: 'CPU', data: s.map((p) => [p.ts, +(p.room_cpu || 0).toFixed(3)]) }];
  }
});

const chartOptions = stableOptions(() => {
  const pct = chart.value === 'fill' || chart.value === 'controller';
  return base({
    chart: { stacked: chart.value === 'stored' },
    colors: chart.value === 'stored' ? [PALETTE.indigo, PALETTE.sky] : chart.value === 'cpu' ? [PALETTE.violet] : [PALETTE.emerald],
    fill: { type: 'gradient', gradient: { opacityFrom: 0.35, opacityTo: 0.04 } },
    yaxis: [pct
      ? { min: 0, max: 100, labels: { formatter: (v) => `${Math.round(v)}%` } }
      : { labels: { formatter: (v) => (chart.value === 'cpu' ? v.toFixed(2) : fmtCompact(v)) } }],
    legend: { show: chart.value === 'stored' },
    tooltip: { shared: true },
  });
});

const roleEntries = computed(() => Object.entries(props.room?.creepsByRole || {}).sort((a, b) => b[1] - a[1]));
const roleSeries = computed(() => [{ name: 'Creeps', data: roleEntries.value.map(([, c]) => c) }]);
const roleOptions = stableOptions(() => base({
  chart: { type: 'bar' },
  plotOptions: { bar: { horizontal: true, borderRadius: 3, barHeight: '60%' } },
  colors: [PALETTE.indigo],
  xaxis: { type: 'category', categories: roleEntries.value.map(([r]) => r), labels: { formatter: (v) => Math.round(v) } },
  dataLabels: { enabled: true, style: { fontSize: '11px', fontWeight: 700 } },
  grid: { yaxis: { lines: { show: false } } },
  legend: { show: false },
}));
</script>
