<template>
  <div class="glass overflow-hidden">
    <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
      <h2 class="text-sm font-bold text-slate-900">Rooms</h2>
      <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        {{ rooms.length }} room{{ rooms.length !== 1 ? 's' : '' }}
      </span>
    </div>

    <div v-if="!rooms.length" class="px-5 py-8 text-center text-xs italic text-slate-400">
      No room data available.
    </div>

    <div v-else class="overflow-x-auto">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr class="border-b border-slate-100 bg-slate-50/70">
            <th class="w-10 px-2 py-3"></th>
            <th
              v-for="col in columns"
              :key="col.key"
              @click="sortBy(col.key)"
              class="cursor-pointer select-none px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest transition-colors"
              :class="sortKey === col.key ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'"
            >
              {{ col.label }}
              <span v-if="sortKey === col.key" class="ml-0.5 text-[9px]">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
            </th>
          </tr>
        </thead>

        <tbody>
          <template v-for="room in sortedRooms" :key="room.name">
            <tr class="border-b border-slate-100 transition-colors hover:bg-slate-50/80" :class="{ 'bg-slate-50/60': expanded.has(room.name) }">
              <td class="px-2 py-3">
                <button
                  class="inline-flex size-6 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500 transition-all hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                  @click="toggleExpanded(room.name)"
                  :aria-expanded="expanded.has(room.name)"
                >{{ expanded.has(room.name) ? '−' : '+' }}</button>
              </td>

              <td class="px-3 py-3 font-medium">
                <a
                  :href="`https://screeps.com/a/#!/room/${room.shard || 'shard0'}/${room.name}`"
                  target="_blank"
                  rel="noopener"
                  class="font-bold text-indigo-600 transition-colors hover:text-indigo-700"
                >{{ room.name }}</a>
                <div class="mt-0.5 text-[10px] text-slate-400">{{ room.shard || 'unknown' }}</div>
              </td>

              <td class="px-3 py-3">
                <span class="inline-flex size-7 items-center justify-center rounded-lg border border-indigo-100 bg-indigo-50 text-xs font-black text-indigo-600">
                  {{ room.rcl }}
                </span>
              </td>

              <td class="px-3 py-3 tabular-nums">
                <span class="font-semibold text-slate-700">{{ fmtInt(room.energy) }}</span>
                <span class="text-slate-400"> / {{ fmtInt(room.energyCapacity) }}</span>
                <div class="mt-1.5 h-1 w-24 overflow-hidden rounded-full bg-slate-100">
                  <div class="h-full rounded-full transition-all duration-500" :class="energyBarColor(room)" :style="{ width: energyPct(room) + '%' }"></div>
                </div>
              </td>

              <td class="px-3 py-3 tabular-nums text-slate-700">{{ fmtInt(room.creeps) }}</td>

              <td class="px-3 py-3 tabular-nums">
                <span class="inline-flex items-center gap-1.5" :class="room.hostiles > 0 ? 'font-bold text-rose-600' : 'text-slate-400'">
                  <span v-if="room.hostiles > 0" class="size-1.5 rounded-full bg-rose-500 shadow-[0_0_4px_rgba(244,63,94,0.35)]"></span>
                  {{ fmtInt(room.hostiles) }}
                </span>
              </td>

              <td class="px-3 py-3 tabular-nums text-slate-700">
                {{ fmtCompact(room.storageEnergy) }}
                <span class="text-slate-400"> / {{ fmtCompact(room.terminalEnergy) }}</span>
              </td>

              <td class="px-3 py-3 tabular-nums text-slate-700">
                {{ fmtInt(room.controllerProgress) }}
                <span class="text-slate-400"> / {{ fmtInt(room.controllerProgressTotal) }}</span>
              </td>

              <td class="px-3 py-3">
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="(role, idx) in topRoles(room.creepsByRole, 3)"
                    :key="role.name"
                    class="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] font-bold ring-1"
                    :class="roleBadgeClass(idx)"
                  >
                    <span class="size-1.5 rounded-full" :class="roleDotClass(idx)"></span>
                    {{ role.name }}: {{ role.count }}
                  </span>
                  <span v-if="!topRoles(room.creepsByRole, 3).length" class="text-xs text-slate-400">—</span>
                </div>
              </td>
            </tr>

            <tr v-if="expanded.has(room.name)" class="border-b border-slate-200 bg-slate-50/60">
              <td></td>
              <td colspan="8" class="px-4 py-4">
                <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div class="glass-sm p-4">
                    <p class="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Role Breakdown</p>
                    <div class="space-y-2.5">
                      <div v-for="(role, idx) in topRoles(room.creepsByRole, 12)" :key="role.name" class="flex items-center gap-2">
                        <span class="size-1.5 shrink-0 rounded-full" :style="{ background: ROLE_COLORS[idx % ROLE_COLORS.length] }"></span>
                        <span class="flex-1 truncate text-xs text-slate-600">{{ role.name }}</span>
                        <span class="w-5 text-right tabular-nums text-xs font-bold text-slate-700">{{ role.count }}</span>
                        <div class="h-1 w-20 overflow-hidden rounded-full bg-slate-100">
                          <div class="h-full rounded-full transition-all duration-300" :style="{ width: roleBarPct(room, role.count) + '%', background: ROLE_COLORS[idx % ROLE_COLORS.length] }"></div>
                        </div>
                      </div>
                      <div v-if="!topRoles(room.creepsByRole, 12).length" class="py-2 text-xs italic text-slate-400">No creeps assigned</div>
                    </div>
                  </div>

                  <div class="glass-sm flex flex-col p-4">
                    <p class="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Controller</p>
                    <div class="flex items-center gap-4">
                      <div class="relative grid size-[84px] shrink-0 place-items-center">
                        <ApexChart type="donut" width="84" height="84" :options="controllerDonutOptions()" :series="controllerDonutSeries(room)" />
                        <div class="pointer-events-none absolute inset-0 grid place-items-center">
                          <span class="text-lg font-bold tabular-nums text-slate-700">{{ controllerPct(room).toFixed(0) }}%</span>
                        </div>
                      </div>
                      <div class="flex-1 space-y-2.5">
                        <div>
                          <p class="text-[10px] uppercase tracking-wider text-slate-400">Progress</p>
                          <p class="tabular-nums text-xs font-bold text-slate-700">
                            {{ fmtInt(room.controllerProgress) }}<span class="font-normal text-slate-400"> / {{ fmtInt(room.controllerProgressTotal) }}</span>
                          </p>
                        </div>
                        <div>
                          <p class="text-[10px] uppercase tracking-wider text-slate-400">Ticks to downgrade</p>
                          <p class="tabular-nums text-xs font-bold" :class="ticksColor(room)">{{ fmtInt(room.ticksToDowngrade) }}</p>
                        </div>
                      </div>
                    </div>
                    <div class="mt-auto border-t border-slate-100 pt-3">
                      <ApexChart type="area" height="48" :options="sparklineOptions('#6366f1', historySeries(room.name, 'controller_progress'))" :series="[{ data: historySeries(room.name, 'controller_progress') }]" />
                    </div>
                  </div>

                  <div class="glass-sm p-4">
                    <p class="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Logistics</p>
                    <div class="space-y-3">
                      <div class="flex items-center gap-3">
                        <span class="w-16 shrink-0 text-xs text-slate-500">Storage</span>
                        <div class="relative h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div class="h-full rounded-full bg-amber-400 transition-all duration-300" :style="{ width: Math.max(storagePct(room), room.storageEnergy > 0 ? 2 : 0) + '%' }"></div>
                        </div>
                        <span class="w-14 text-right tabular-nums text-xs font-bold text-slate-700">{{ fmtCompact(room.storageEnergy) }}</span>
                      </div>
                      <div class="flex items-center gap-3">
                        <span class="w-16 shrink-0 text-xs text-slate-500">Terminal</span>
                        <div class="relative h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div class="h-full rounded-full bg-sky-400 transition-all duration-300" :style="{ width: Math.max(terminalPct(room), room.terminalEnergy > 0 ? 2 : 0) + '%' }"></div>
                        </div>
                        <span class="w-14 text-right tabular-nums text-xs font-bold text-slate-700">{{ fmtCompact(room.terminalEnergy) }}</span>
                      </div>
                      <div class="border-t border-slate-100"></div>
                      <div class="flex items-center justify-between rounded-xl px-3 py-2 transition-colors" :class="room.hostiles > 0 ? 'border border-rose-200 bg-rose-50' : 'bg-slate-50'">
                        <span class="flex items-center gap-2 text-xs font-semibold" :class="room.hostiles > 0 ? 'text-rose-600' : 'text-slate-400'">
                          <span class="size-1.5 rounded-full transition-colors" :class="room.hostiles > 0 ? 'bg-rose-500 shadow-[0_0_4px_rgba(244,63,94,0.35)]' : 'bg-slate-200'"></span>
                          Hostiles
                        </span>
                        <span class="tabular-nums text-sm font-black" :class="room.hostiles > 0 ? 'text-rose-600' : 'text-slate-300'">
                          {{ fmtInt(room.hostiles) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <StatCard
                    v-for="trend in ROOM_TRENDS"
                    :key="trend.key"
                    :label="trend.label"
                    :value="trend.fmt(lastVal(room.name, trend.key))"
                    :color="trendColor(trend, room.name)"
                    :sparkData="historySeries(room.name, trend.key)"
                  />
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import ApexChart from 'vue3-apexcharts';
import StatCard from './StatCard.vue';

const props = defineProps({
  rooms: { type: Array, default: () => [] },
  roomHistoryMap: { type: Object, default: () => ({}) },
});

const ROLE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#0ea5e9', '#ef4444', '#14b8a6'];
const ROLE_BADGE = [
  { bg: 'bg-indigo-50 text-indigo-600 ring-indigo-200', dot: 'bg-indigo-500' },
  { bg: 'bg-emerald-50 text-emerald-600 ring-emerald-200', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-50 text-amber-600 ring-amber-200', dot: 'bg-amber-500' },
  { bg: 'bg-violet-50 text-violet-600 ring-violet-200', dot: 'bg-violet-500' },
  { bg: 'bg-sky-50 text-sky-600 ring-sky-200', dot: 'bg-sky-500' },
  { bg: 'bg-rose-50 text-rose-600 ring-rose-200', dot: 'bg-rose-500' },
];

function roleBadgeClass(idx) { return ROLE_BADGE[idx % ROLE_BADGE.length].bg; }
function roleDotClass(idx) { return ROLE_BADGE[idx % ROLE_BADGE.length].dot; }

const columns = [
  { key: 'name', label: 'Room' },
  { key: 'rcl', label: 'RCL' },
  { key: 'energy', label: 'Energy' },
  { key: 'creeps', label: 'Creeps' },
  { key: 'hostiles', label: 'Hostiles' },
  { key: 'storageEnergy', label: 'Storage/Terminal' },
  { key: 'controllerProgress', label: 'Controller' },
  { key: 'roleCount', label: 'Roles' },
];

const sortKey = ref('hostiles');
const sortDir = ref('desc');
const expanded = ref(new Set());

function toggleExpanded(name) {
  const next = new Set(expanded.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  expanded.value = next;
}

function sortBy(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDir.value = key === 'name' ? 'asc' : 'desc';
  }
}

function topRoles(roleMap = {}, max = 4) {
  return Object.entries(roleMap || {})
    .map(([name, count]) => ({ name, count: Number(count) || 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, max);
}

function sortableValue(room, key) {
  if (key === 'roleCount') return Object.keys(room.creepsByRole || {}).length;
  return room[key] ?? 0;
}

function energyPct(room) {
  if (!room.energyCapacity) return 0;
  return Math.min(100, (Number(room.energy || 0) / Number(room.energyCapacity || 1)) * 100).toFixed(1);
}

function energyBarColor(room) {
  const pct = parseFloat(energyPct(room));
  if (pct >= 80) return 'bg-emerald-400';
  if (pct >= 40) return 'bg-amber-400';
  return 'bg-rose-500';
}

function storagePct(room) {
  return Math.min(100, ((Number(room.storageEnergy) || 0) / 1_000_000) * 100).toFixed(1);
}

function terminalPct(room) {
  return Math.min(100, ((Number(room.terminalEnergy) || 0) / 300_000) * 100).toFixed(1);
}

function roleBarPct(room, count) {
  const max = Math.max(...Object.values(room.creepsByRole || {}).map(Number), 1);
  return Math.min(100, (count / max) * 100).toFixed(1);
}

function fmtInt(value) {
  return Math.round(Number(value) || 0).toLocaleString();
}

function fmtCompact(value) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0);
}

const ROOM_TRENDS = [
  { label: 'Energy Trend', key: 'energy', color: 'warning', fmt: fmtCompact },
  { label: 'Creep Trend', key: 'creeps', color: 'accent', fmt: fmtInt },
  { label: 'Hostile Trend', key: 'hostiles', color: 'danger', fmt: fmtInt },
];

function trendColor(trend, roomName) {
  if (trend.key !== 'hostiles') return trend.color;
  return lastVal(roomName, trend.key) > 0 ? 'danger' : 'success';
}

function historySeries(roomName, key) {
  const rows = props.roomHistoryMap?.[roomName] || [];
  return rows.map((r) => Number(r[key]) || 0);
}

function lastVal(roomName, key) {
  const series = historySeries(roomName, key);
  return series.length ? series[series.length - 1] : 0;
}

function controllerPct(room) {
  const current = Number(room.controllerProgress) || 0;
  const total = Number(room.controllerProgressTotal) || 0;
  if (!total) return 0;
  return Math.max(0, Math.min(100, (current / total) * 100));
}

function controllerDonutSeries(room) {
  const pct = controllerPct(room);
  return [parseFloat(pct.toFixed(2)), parseFloat((100 - pct).toFixed(2))];
}

function controllerDonutOptions() {
  return {
    chart: {
      type: 'donut',
      sparkline: { enabled: true },
      animations: { enabled: false },
      background: 'transparent',
    },
    labels: ['Progress', 'Remaining'],
    colors: ['#6366f1', '#e2e8f0'],
    stroke: { width: 0 },
    legend: { show: false },
    dataLabels: { enabled: false },
    tooltip: { enabled: false },
    plotOptions: {
      pie: {
        donut: {
          size: '72%',
          labels: { show: false },
        },
      },
    },
  };
}

function ticksColor(room) {
  const t = Number(room.ticksToDowngrade) || 0;
  if (t < 1000) return 'text-rose-600';
  if (t < 5000) return 'text-amber-500';
  return 'text-emerald-600';
}

function sparklineOptions(color, data = []) {
  const vals = (data || []).map((n) => Number(n) || 0);
  let min = 0;
  let max = 1;

  if (vals.length) {
    min = Math.min(...vals);
    max = Math.max(...vals);
    if (min === max) {
      const pad = Math.max(Math.abs(min) * 0.05, 1);
      min -= pad;
      max += pad;
    } else {
      const pad = (max - min) * 0.15;
      min -= pad;
      max += pad;
    }
  }

  return {
    chart: {
      type: 'area',
      sparkline: { enabled: true },
      animations: { enabled: false },
      background: 'transparent',
      toolbar: { show: false },
    },
    stroke: { curve: 'smooth', width: 2.3 },
    colors: [color],
    fill: {
      type: 'gradient',
      gradient: {
        shade: 'light',
        type: 'vertical',
        opacityFrom: 0.24,
        opacityTo: 0.05,
      },
    },
    yaxis: {
      min,
      max,
      show: false,
    },
    markers: { size: 0 },
    grid: { show: false },
    tooltip: { enabled: false },
  };
}

const sortedRooms = computed(() =>
  [...props.rooms].sort((a, b) => {
    const av = sortableValue(a, sortKey.value);
    const bv = sortableValue(b, sortKey.value);
    const dir = sortDir.value === 'asc' ? 1 : -1;
    if (typeof av === 'string') return av.localeCompare(bv) * dir;
    return (av - bv) * dir;
  })
);
</script>
