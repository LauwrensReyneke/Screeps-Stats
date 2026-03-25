<template>
  <div class="min-h-screen bg-slate-50 text-slate-900">

    <!-- ambient glow blobs -->
    <div class="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <div class="absolute -top-32 -left-32 h-[520px] w-[520px] rounded-full bg-indigo-200/45 blur-[120px]"></div>
      <div class="absolute top-1/3 right-0 h-[420px] w-[420px] rounded-full bg-sky-100/70 blur-[110px]"></div>
      <div class="absolute bottom-0 left-1/3 h-[320px] w-[320px] rounded-full bg-violet-100/60 blur-[100px]"></div>
    </div>

    <!-- ── HEADER ── -->
    <header class="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
      <div class="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-3">
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-auto items-center justify-center rounded-lg bg-indigo-950/100 ring-1 ring-indigo-500/30">
            <img :src="screepsLogo" alt="Screeps" class="h-6 w-auto rounded-sm opacity-90" />
          </div>
          <div>
            <h1 class="text-sm font-bold tracking-tight text-slate-900">Screeps</h1>
            <p class="text-[10px] font-medium uppercase tracking-widest text-slate-400">Stats Dashboard</p>
          </div>
        </div>

        <!-- status + alerts -->
        <div class="flex items-center gap-4">
          <div v-if="status === 'error'" class="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
            <font-awesome-icon :icon="faTriangleExclamation" class="text-[10px]" /> {{ errorMessage }}
          </div>
          <div v-else-if="status === 'stale'" class="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-600">
            <font-awesome-icon :icon="faClockRotateLeft" class="text-[10px]" /> Stale – retrying…
          </div>
          <div class="flex items-center gap-2 text-xs text-slate-500">
            <span class="size-1.5 rounded-full" :class="statusDotClass"></span>
            <span class="font-semibold text-slate-700">{{ statusLabel }}</span>
            <span v-if="lastUpdated" class="text-slate-400">{{ timeSince }}s ago</span>
          </div>
        </div>
      </div>
    </header>

    <main class="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-7">

      <!-- ── FILTERS BAR ── -->
      <section class="glass flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div class="flex items-center gap-1.5">
          <span class="pr-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Range</span>
          <button
            v-for="opt in RANGE_OPTIONS"
            :key="opt.key"
            class="rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150"
            :class="selectedRange === opt.key
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'"
            @click="selectedRange = opt.key"
          >{{ opt.label }}</button>
        </div>

        <div class="flex items-center gap-2.5">
          <label for="shardFilter" class="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Shard</label>
          <select id="shardFilter" v-model="selectedShard"
            class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-200">
            <option value="all" class="bg-white">All</option>
            <option v-for="shard in shardOptions" :key="shard" :value="shard" class="bg-white">{{ shard }}</option>
          </select>
        </div>
      </section>

      <!-- ── SKELETON ── -->
      <template v-if="status === 'loading' && !data">
        <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div v-for="i in 4" :key="`p-${i}`" class="h-28 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200"></div>
        </div>
        <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div v-for="i in 4" :key="`s-${i}`" class="h-24 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200"></div>
        </div>
        <div class="h-64 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200"></div>
      </template>

      <template v-else-if="data">

        <!-- ── PRIMARY STATS ── -->
        <section class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="CPU Used" :value="data.cpu.used" unit="ms" :decimals="2" :icon="faBolt" :color="cpuColor" :sub="`Limit ${fmtInt(data.cpu.limit)} ms`" :sparkData="sparkCpuUsed" info="How much CPU your scripts consumed this tick versus your available CPU limit." />
          <StatCard label="CPU Bucket" :value="fmtInt(data.cpu.bucket)" :icon="faBucket" :color="bucketColor" sub="Target > 3,000" :sparkData="sparkBucket" info="Saved CPU reserve. A higher bucket gives you headroom during expensive ticks." />
          <StatCard label="Hostiles" :value="fmtInt(totalHostiles)" :icon="faShieldHalved" :color="totalHostiles > 0 ? 'danger' : 'success'" :sub="`${hostileRooms} room${hostileRooms === 1 ? '' : 's'} active`" info="Total hostile creeps seen across your visible rooms in the current snapshot." />
          <StatCard label="Credits" :value="fmtCompact(data.global?.credits || 0)" :icon="faCoins" color="success" :sub="fmtInt(data.global?.credits || 0)" :sparkData="sparkCredits" info="Your current market credits, useful for tracking buying/selling power over time." />
        </section>

        <!-- ── SECONDARY STATS ── -->
        <section class="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Tick" :value="fmtInt(data.tick)" :icon="faHashtag" color="accent" :sparkData="sparkTick" info="Current game tick from the latest stats payload." />
          <StatCard label="Rooms" :value="fmtInt(filteredRooms.length)" :icon="faLayerGroup" color="sky" :sparkData="sparkRooms" info="Number of rooms currently shown after applying the shard filter." />
          <StatCard label="Total Creeps" :value="fmtInt(data.totals?.creeps || totalCreeps)" :icon="faUsers" color="accent" :sparkData="sparkCreeps" info="Total population size. Helps you spot spawn bottlenecks or sudden losses." />
          <StatCard label="GCL" :value="fmtInt(data.global?.gcl?.level || 0)" :icon="faChartLine" color="accent" :sub="`${gclPct}%`" :sparkData="sparkGcl" info="Your Global Control Level. The percentage shows progress toward the next GCL level." />
        </section>

        <!-- ── THREAT BANNER ── -->
        <section v-if="threatRooms.length" class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
          <div class="mb-2.5 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-rose-600">
            <span class="size-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.35)]"></span>
            <span>Threat Monitor</span>
            <InfoTooltip aria-label="Threat monitor explanation">
              Rooms with active hostile creeps. This helps you quickly spot invaded territories that need attention.
            </InfoTooltip>
          </div>
          <div class="flex flex-wrap gap-2">
            <span v-for="room in threatRooms" :key="room.name"
              class="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-600">
              {{ room.name }} · {{ room.shard }} · {{ fmtInt(room.hostiles) }} hostiles
            </span>
          </div>
        </section>

        <!-- ── CPU + GLOBAL ROW ── -->
        <section class="grid grid-cols-1 gap-4 xl:grid-cols-2">

          <!-- CPU strip + phases -->
          <div class="glass p-5 space-y-5">
            <div>
              <div class="mb-2.5 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-bold uppercase tracking-widest text-slate-400">CPU Utilization</span>
                  <InfoTooltip aria-label="CPU usage explanation">
                    How much of your CPU limit you're using per tick. High values (>90%) indicate tight performance margins.
                  </InfoTooltip>
                </div>
                <span class="text-xs font-semibold tabular-nums" :class="cpuUsedPct >= 90 ? 'text-rose-500' : cpuUsedPct >= 70 ? 'text-amber-500' : 'text-emerald-500'">
                  {{ cpuUsedPct }}%
                </span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div class="h-full rounded-full transition-all duration-700"
                  :class="cpuBarClass"
                  :style="{ width: `${cpuUsedPct}%` }"></div>
              </div>
              <p class="mt-1.5 text-[10px] text-slate-400">{{ data.cpu.used.toFixed(2) }} ms of {{ fmtInt(data.cpu.limit) }} ms limit</p>
            </div>

            <PhaseBars :phases="data.phases" />
          </div>

          <!-- Global / GCL -->
          <div class="glass p-5">
            <div class="mb-4 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <h2 class="text-sm font-bold uppercase tracking-widest text-slate-500">Global</h2>
                <InfoTooltip aria-label="Global stats explanation">
                  Cross-shard statistics for your account, aggregating data across all shards you control.
                </InfoTooltip>
              </div>
              <span class="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold text-slate-500">
                {{ shardOptions.length }} shard{{ shardOptions.length !== 1 ? 's' : '' }}
              </span>
            </div>

            <div class="flex items-center gap-6">
              <div class="relative flex size-[130px] shrink-0 items-center justify-center">
                <ApexChart type="donut" width="130" height="130" :options="gclDonutOptions" :series="gclDonutSeries" />
                <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
                  <span class="text-2xl font-black tabular-nums text-slate-800">{{ gclPct }}%</span>
                  <span class="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Complete</span>
                </div>
              </div>
              <div class="flex-1 space-y-3">
                <div>
                  <p class="text-[10px] font-semibold uppercase tracking-widest text-slate-400">GCL Level</p>
                  <p class="text-2xl font-black text-slate-900 tabular-nums">{{ fmtInt(data.global?.gcl?.level || 0) }}</p>
                </div>
                <div>
                  <p class="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Progress</p>
                  <p class="text-sm font-semibold text-indigo-600 tabular-nums">{{ gclPct }}%</p>
                  <p class="text-xs text-slate-500 tabular-nums">{{ fmtInt(gclProgress) }} / {{ fmtInt(gclProgressTotal) }}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- ── HISTORY CHARTS ── -->
        <section class="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <HistoryChart
            title="CPU and Bucket"
            subtitle="Execution pressure and reserve trends."
            :rows="activeHistoryRows"
            :tabs="[{ key: 'cpu', label: 'CPU' }, { key: 'bucket', label: 'Bucket' }]"
            v-model:activeKey="cpuHistoryTab"
          />
          <HistoryChart
            title="Economy and Population"
            subtitle="Credits and role distribution trends."
            :rows="activeHistoryRows"
            :tabs="[{ key: 'credits', label: 'Credits' }, { key: 'roles', label: 'Roles' }]"
            :customSeries="roleHistorySeries"
            :customTimestamps="roleHistoryTimestamps"
            v-model:activeKey="economyHistoryTab"
          />
        </section>

        <section class="space-y-2">
          <div v-if="selectedHeatmapCell" class="flex flex-wrap items-center justify-between gap-2 px-1">
            <p class="text-xs text-slate-500">
              Heatmap filter: <span class="font-semibold text-slate-700">{{ heatmapWindowLabel }}</span>
            </p>
            <button
              class="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-800"
              @click="clearHeatmapSelection"
            >Clear filter</button>
          </div>
          <MetricHeatmap
            title="Timeline Heatmap"
            subtitle="Bucketed activity over time."
            :seriesByMetric="heatmapSeriesByMetric"
            :selectedCellStart="selectedHeatmapCell?.start ?? null"
            v-model:activeKey="heatmapMetric"
            @select-cell="onHeatmapCellSelect"
          />
        </section>

        <!-- ── ROOMS TABLE ── -->
        <RoomsTable :rooms="filteredRooms" :roomHistoryMap="filteredRoomHistoryMap" />
      </template>

      <!-- ── ERROR STATE ── -->
      <template v-else-if="status === 'error'">
        <div class="glass px-5 py-20 text-center">
          <p class="mb-4 text-5xl text-rose-500"><font-awesome-icon :icon="faTriangleExclamation" /></p>
          <p class="mb-1.5 text-lg font-bold text-slate-900">Failed to load stats</p>
          <p class="text-sm text-slate-500">{{ errorMessage }}</p>
        </div>
      </template>
    </main>

    <footer class="mx-auto flex w-full max-w-7xl items-center justify-between border-t border-slate-200 px-5 py-3 text-[11px] text-slate-400">
      <span class="font-medium tracking-wide">Screeps Stats</span>
      <span v-if="data" class="tabular-nums">Tick {{ fmtInt(data.tick) }}</span>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import ApexChart from 'vue3-apexcharts';
import screepsLogo from './assets/screeps.svg';
import {
  faTriangleExclamation,
  faClockRotateLeft,
  faHashtag,
  faBolt,
  faBucket,
  faUsers,
  faLayerGroup,
  faCoins,
  faChartLine,
  faShieldHalved,
} from '@fortawesome/free-solid-svg-icons';
import StatCard from './components/StatCard.vue';
import PhaseBars from './components/PhaseBars.vue';
import RoomsTable from './components/RoomsTable.vue';
import HistoryChart from './components/HistoryChart.vue';
import MetricHeatmap from './components/MetricHeatmap.vue';
import InfoTooltip from './components/InfoTooltip.vue';

const PREFS_KEY = 'screeps-stats.ui-prefs.v1';

const RANGE_OPTIONS = [
  { key: '15m', label: '15m', ms: 15 * 60 * 1000 },
  { key: '1h', label: '1h', ms: 60 * 60 * 1000 },
  { key: '6h', label: '6h', ms: 6 * 60 * 60 * 1000 },
  { key: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: 'all', label: 'All', ms: null },
];

const data = ref(null);
const status = ref('loading');
const errorMessage = ref('');
const lastUpdated = ref(null);
const now = ref(Date.now());

const selectedRange = ref('24h');
const selectedShard = ref('all');
const cpuHistoryTab = ref('cpu');
const economyHistoryTab = ref('credits');
const heatmapMetric = ref('activity');
const selectedHeatmapCell = ref(null);

const historyRows = ref([]);
const roomHistoryMap = ref({});
const HISTORY_LIMIT = 1440;
const ROOM_HISTORY_LIMIT = 120;
const HISTORY_REFRESH = 60_000;
let historyTimer = null;
let roomHistoryRequestId = 0;

const shardOptions = computed(() =>
  [...new Set((data.value?.rooms || []).map((r) => r.shard || 'unknown'))].sort()
);

const filteredRooms = computed(() => {
  const rooms = data.value?.rooms || [];
  if (selectedShard.value === 'all') return rooms;
  return rooms.filter((r) => (r.shard || 'unknown') === selectedShard.value);
});

const filteredHistoryRows = computed(() => {
  const opt = RANGE_OPTIONS.find((r) => r.key === selectedRange.value);
  if (!opt?.ms) return historyRows.value;
  const since = Date.now() - opt.ms;
  return historyRows.value.filter((r) => Number(r.ts) >= since);
});

const activeHistoryRows = computed(() => {
  const base = filteredHistoryRows.value;
  const selected = selectedHeatmapCell.value;
  if (!selected) return base;

  const scoped = base.filter((r) => {
    const ts = Number(r.ts) || 0;
    return ts >= selected.start && ts <= selected.end;
  });

  // Avoid collapsing charts when a very small bucket contains too few points.
  return scoped.length >= 2 ? scoped : base;
});

const filteredRoomHistoryMap = computed(() => {
  const selected = selectedHeatmapCell.value;
  if (!selected) return roomHistoryMap.value;

  const next = {};
  let totalRows = 0;

  for (const [room, rows] of Object.entries(roomHistoryMap.value || {})) {
    const scoped = (rows || []).filter((r) => {
      const ts = Number(r.ts) || 0;
      return ts >= selected.start && ts <= selected.end;
    });
    next[room] = scoped;
    totalRows += scoped.length;
  }

  // If the selection yields no room history, keep the full map so room trends remain usable.
  return totalRows > 0 ? next : roomHistoryMap.value;
});

const heatmapWindowLabel = computed(() => {
  const selected = selectedHeatmapCell.value;
  if (!selected) return '';

  const start = new Date(selected.start).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const end = new Date(selected.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${start} - ${end}`;
});

const totalCreeps = computed(() => filteredRooms.value.reduce((sum, r) => sum + (Number(r.creeps) || 0), 0));
const totalHostiles = computed(() => filteredRooms.value.reduce((sum, r) => sum + (Number(r.hostiles) || 0), 0));
const hostileRooms = computed(() => filteredRooms.value.filter((r) => Number(r.hostiles) > 0).length);
const threatRooms = computed(() => filteredRooms.value.filter((r) => Number(r.hostiles) > 0));

const gclProgress = computed(() => Number(data.value?.global?.gcl?.progress) || 0);
const gclProgressTotal = computed(() => Number(data.value?.global?.gcl?.progressTotal) || 0);
const gclPct = computed(() => {
  if (!gclProgressTotal.value) return '0';
  return ((gclProgress.value / gclProgressTotal.value) * 100).toFixed(0);
});

const gclDonutSeries = computed(() => {
  if (!gclProgressTotal.value) return [0, 1];
  const current = Math.max(0, Math.min(gclProgress.value, gclProgressTotal.value));
  const remaining = Math.max(gclProgressTotal.value - current, 0);
  return [current, remaining];
});

const gclDonutOptions = computed(() => ({
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
        size: '76%',
        labels: {
          show: false,
        },
      },
    },
  },
}));

const sparkTick = computed(() => activeHistoryRows.value.map((r) => Number(r.tick) || 0));
const sparkCpuUsed = computed(() => activeHistoryRows.value.map((r) => Number(r.cpu_used) || 0));
const sparkBucket = computed(() => activeHistoryRows.value.map((r) => Number(r.cpu_bucket) || 0));
const sparkCreeps = computed(() => activeHistoryRows.value.map((r) => Number(r.total_creeps) || 0));
const sparkRooms = computed(() => activeHistoryRows.value.map((r) => Number(r.total_rooms) || 0));
const sparkCredits = computed(() => activeHistoryRows.value.map((r) => Number(r.credits) || 0));
const sparkGcl = computed(() => activeHistoryRows.value.map((r) => Number(r.gcl_progress) || 0));

const timeSince = computed(() => (lastUpdated.value ? Math.floor((now.value - lastUpdated.value) / 1000) : null));

const cpuUsedPct = computed(() => {
  if (!data.value?.cpu?.limit) return 0;
  return Math.min(100, (data.value.cpu.used / data.value.cpu.limit) * 100).toFixed(1);
});

const cpuColor = computed(() => {
  const p = parseFloat(cpuUsedPct.value);
  if (p >= 90) return 'danger';
  if (p >= 70) return 'warning';
  return 'success';
});

const cpuBarClass = computed(() => ({
  'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.25)]': cpuColor.value === 'success',
  'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.25)]': cpuColor.value === 'warning',
  'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.25)]': cpuColor.value === 'danger',
}));

const bucketColor = computed(() => {
  const b = data.value?.cpu?.bucket ?? 10000;
  if (b < 1000) return 'danger';
  if (b < 3000) return 'warning';
  return 'success';
});

const statusLabel = computed(() => ({
  loading: 'Connecting...',
  ok: 'Live',
  stale: 'Stale',
  error: 'Error',
}[status.value] ?? ''));

const statusDotClass = computed(() => ({
  ok: 'bg-emerald-400 shadow-[0_0_6px_#34d399]',
  stale: 'bg-amber-400 shadow-[0_0_6px_#fbbf24]',
  error: 'bg-red-400 shadow-[0_0_6px_#f87171]',
  loading: 'bg-sky-400 animate-pulse shadow-[0_0_6px_#38bdf8]',
}[status.value] ?? 'bg-sky-400 animate-pulse'));

function fmtInt(value) {
  return Math.round(Number(value) || 0).toLocaleString();
}

function fmtCompact(value) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0);
}

const POLL_INTERVAL = 60_000;
let pollTimer = null;
let clockTimer = null;

async function fetchStats() {
  let fetchErr = null;
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      fetchErr = new Error(body.error || `HTTP ${res.status}`);
    } else {
      data.value = await res.json();
      lastUpdated.value = Date.now();
      status.value = 'ok';
      errorMessage.value = '';
    }
  } catch (err) {
    fetchErr = err;
  }

  if (fetchErr) {
    errorMessage.value = fetchErr.message || 'Unknown error';
    status.value = data.value ? 'stale' : 'error';
  } else {
    fetchHistory();
  }
}

async function fetchHistory() {
  try {
    const res = await fetch(`/api/history?limit=${HISTORY_LIMIT}`);
    if (!res.ok) return;
    const json = await res.json();
    historyRows.value = json.rows || [];
  } catch {
    // non-fatal
  }
}

onMounted(() => {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    if (prefs.range && RANGE_OPTIONS.some((r) => r.key === prefs.range)) selectedRange.value = prefs.range;
    if (typeof prefs.shard === 'string') selectedShard.value = prefs.shard;
    if (typeof prefs.cpuTab === 'string') cpuHistoryTab.value = prefs.cpuTab;
    if (typeof prefs.ecoTab === 'string') economyHistoryTab.value = prefs.ecoTab;
    if (typeof prefs.heatmapTab === 'string') heatmapMetric.value = prefs.heatmapTab;
  } catch {
    // ignore malformed localStorage
  }

  fetchStats();
  fetchHistory();
  fetchRoomHistories();
  pollTimer = setInterval(fetchStats, POLL_INTERVAL);
  historyTimer = setInterval(fetchHistory, HISTORY_REFRESH);
  clockTimer = setInterval(() => {
    now.value = Date.now();
  }, 5000);
});

onUnmounted(() => {
  clearInterval(pollTimer);
  clearInterval(historyTimer);
  clearInterval(clockTimer);
});

watch(shardOptions, (options) => {
  if (selectedShard.value !== 'all' && !options.includes(selectedShard.value)) {
    selectedShard.value = 'all';
  }
});

const roleHistoryPoints = computed(() => {
  const byTs = new Map();

  for (const rows of Object.values(filteredRoomHistoryMap.value || {})) {
    for (const row of rows || []) {
      const ts = Number(row.ts) || 0;
      if (!ts) continue;
      if (!byTs.has(ts)) byTs.set(ts, {});
      const slot = byTs.get(ts);
      const roles = row.roles || {};
      for (const [role, count] of Object.entries(roles)) {
        slot[role] = (slot[role] || 0) + (Number(count) || 0);
      }
    }
  }

  return [...byTs.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, roles]) => ({ ts, roles }));
});

const topRoleKeys = computed(() => {
  const totals = {};
  for (const point of roleHistoryPoints.value) {
    for (const [role, count] of Object.entries(point.roles || {})) {
      totals[role] = (totals[role] || 0) + (Number(count) || 0);
    }
  }
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([role]) => role);
});

const roleHistoryTimestamps = computed(() => roleHistoryPoints.value.map((p) => p.ts));

const roleHistorySeries = computed(() =>
  topRoleKeys.value.map((role) => ({
    name: role,
    type: 'area',
    data: roleHistoryPoints.value.map((p) => Number(p.roles?.[role]) || 0),
  }))
);

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function avg(sum, count) {
  return count ? sum / count : 0;
}

function resolveHeatmapBucketMs(sortedRows) {
  if (sortedRows.length < 2) return 15 * 60 * 1000;
  const span = Number(sortedRows[sortedRows.length - 1].ts) - Number(sortedRows[0].ts);

  if (span <= 60 * 60 * 1000) return 2 * 60 * 1000;
  if (span <= 6 * 60 * 60 * 1000) return 5 * 60 * 1000;
  if (span <= 24 * 60 * 60 * 1000) return 15 * 60 * 1000;
  if (span <= 72 * 60 * 60 * 1000) return 30 * 60 * 1000;
  return 60 * 60 * 1000;
}

const heatmapSeriesByMetric = computed(() => {
  const rows = [...(filteredHistoryRows.value || [])]
    .filter((r) => Number.isFinite(Number(r.ts)))
    .sort((a, b) => Number(a.ts) - Number(b.ts));

  if (!rows.length) return {};

  const bucketMs = resolveHeatmapBucketMs(rows);
  const bucketMap = new Map();

  for (const row of rows) {
    const ts = Number(row.ts);
    const start = Math.floor(ts / bucketMs) * bucketMs;

    if (!bucketMap.has(start)) {
      bucketMap.set(start, {
        start,
        count: 0,
        cpuUsedSum: 0,
        cpuLimitSum: 0,
        cpuBucketSum: 0,
        creepsSum: 0,
        roomsSum: 0,
        creditsLast: 0,
        hostilesSum: 0,
        hostileRooms: new Set(),
      });
    }

    const slot = bucketMap.get(start);
    slot.count += 1;
    slot.cpuUsedSum += Number(row.cpu_used) || 0;
    slot.cpuLimitSum += Number(row.cpu_limit) || 0;
    slot.cpuBucketSum += Number(row.cpu_bucket) || 0;
    slot.creepsSum += Number(row.total_creeps) || 0;
    slot.roomsSum += Number(row.total_rooms) || 0;
    slot.creditsLast = Number(row.credits) || 0;
  }

  for (const [roomName, roomRows] of Object.entries(roomHistoryMap.value || {})) {
    for (const row of roomRows || []) {
      const ts = Number(row.ts) || 0;
      if (!ts) continue;
      const start = Math.floor(ts / bucketMs) * bucketMs;

      if (!bucketMap.has(start)) {
        bucketMap.set(start, {
          start,
          count: 0,
          cpuUsedSum: 0,
          cpuLimitSum: 0,
          cpuBucketSum: 0,
          creepsSum: 0,
          roomsSum: 0,
          creditsLast: 0,
          hostilesSum: 0,
          hostileRooms: new Set(),
        });
      }

      const slot = bucketMap.get(start);
      const hostiles = Number(row.hostiles) || 0;
      slot.hostilesSum += hostiles;
      if (hostiles > 0) slot.hostileRooms.add(roomName);
    }
  }

  const minStart = Math.min(...bucketMap.keys());
  const maxStart = Math.max(...bucketMap.keys());
  const buckets = [];

  for (let start = minStart; start <= maxStart; start += bucketMs) {
    buckets.push(
      bucketMap.get(start) || {
        start,
        count: 0,
        cpuUsedSum: 0,
        cpuLimitSum: 0,
        cpuBucketSum: 0,
        creepsSum: 0,
        roomsSum: 0,
        creditsLast: 0,
        hostilesSum: 0,
        hostileRooms: new Set(),
      }
    );
  }

  const maxCreeps = Math.max(...buckets.map((b) => avg(b.creepsSum, b.count)), 1);
  const maxRooms = Math.max(...buckets.map((b) => avg(b.roomsSum, b.count)), 1);

  const makeCells = (valueFn) =>
    buckets.map((b) => ({
      start: b.start,
      end: b.start + bucketMs,
      value: Number(valueFn(b)) || 0,
    }));

  return {
    activity: {
      label: 'Activity',
      subtitle: 'CPU pressure blended with creep and room activity.',
      unit: 'score',
      palette: 'activity',
      cells: makeCells((b) => {
        const cpuUsed = avg(b.cpuUsedSum, b.count);
        const cpuLimit = Math.max(1, avg(b.cpuLimitSum, b.count));
        const cpuPct = clamp01(cpuUsed / cpuLimit);
        const creepsNorm = clamp01(avg(b.creepsSum, b.count) / maxCreeps);
        const roomsNorm = clamp01(avg(b.roomsSum, b.count) / maxRooms);
        return (cpuPct * 55) + (creepsNorm * 30) + (roomsNorm * 15);
      }),
    },
    cpu_stress: {
      label: 'CPU Stress',
      subtitle: 'High values mean high CPU use and low bucket reserves.',
      unit: '%',
      palette: 'cpu_stress',
      cells: makeCells((b) => {
        const cpuUsed = avg(b.cpuUsedSum, b.count);
        const cpuLimit = Math.max(1, avg(b.cpuLimitSum, b.count));
        const cpuPct = clamp01(cpuUsed / cpuLimit);
        const bucketPct = clamp01(avg(b.cpuBucketSum, b.count) / 10000);
        return ((cpuPct * 0.8) + ((1 - bucketPct) * 0.2)) * 100;
      }),
    },
    cpu_bucket: {
      label: 'Bucket',
      subtitle: 'Average CPU bucket reserve per time bucket.',
      unit: 'compact',
      palette: 'cpu_bucket',
      cells: makeCells((b) => avg(b.cpuBucketSum, b.count)),
    },
    creeps: {
      label: 'Creeps',
      subtitle: 'Average total creeps over time.',
      unit: 'compact',
      palette: 'creeps',
      cells: makeCells((b) => avg(b.creepsSum, b.count)),
    },
    credits: {
      label: 'Credits',
      subtitle: 'Latest credit snapshot in each time bucket.',
      unit: 'compact',
      palette: 'credits',
      cells: makeCells((b) => b.creditsLast),
    },
    threat: {
      label: 'Threat',
      subtitle: 'Hostile presence weighted by total hostiles and affected rooms.',
      unit: 'score',
      palette: 'threat',
      cells: makeCells((b) => {
        const hostileRooms = b.hostileRooms.size;
        return b.hostilesSum + (hostileRooms * 4);
      }),
    },
  };
});

function onHeatmapCellSelect(cell) {
  if (!cell || !Number.isFinite(Number(cell.start))) return;

  const active = selectedHeatmapCell.value;
  if (active && Number(active.start) === Number(cell.start) && Number(active.end) === Number(cell.end)) {
    selectedHeatmapCell.value = null;
    return;
  }

  selectedHeatmapCell.value = {
    start: Number(cell.start),
    end: Number(cell.end),
  };
}

function clearHeatmapSelection() {
  selectedHeatmapCell.value = null;
}

watch(
  [selectedRange, selectedShard, cpuHistoryTab, economyHistoryTab, heatmapMetric],
  () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      range: selectedRange.value,
      shard: selectedShard.value,
      cpuTab: cpuHistoryTab.value,
      ecoTab: economyHistoryTab.value,
      heatmapTab: heatmapMetric.value,
    }));
  },
  { deep: true }
);

watch(heatmapSeriesByMetric, (seriesMap) => {
  if (!seriesMap[heatmapMetric.value]) {
    heatmapMetric.value = Object.keys(seriesMap)[0] || 'activity';
  }

  if (selectedHeatmapCell.value) {
    const metricCells = seriesMap[heatmapMetric.value]?.cells || [];
    const stillExists = metricCells.some((c) => Number(c.start) === Number(selectedHeatmapCell.value.start));
    if (!stillExists) selectedHeatmapCell.value = null;
  }
});

watch(heatmapMetric, () => {
  selectedHeatmapCell.value = null;
});

watch([selectedRange, selectedShard], () => {
  fetchRoomHistories();
});

watch(filteredRooms, () => {
  fetchRoomHistories();
}, { deep: true });

function rangeSinceTs() {
  const opt = RANGE_OPTIONS.find((r) => r.key === selectedRange.value);
  if (!opt?.ms) return null;
  return Date.now() - opt.ms;
}

async function fetchRoomHistories() {
  const rooms = filteredRooms.value || [];
  if (!rooms.length) {
    roomHistoryMap.value = {};
    return;
  }

  const reqId = ++roomHistoryRequestId;
  const since = rangeSinceTs();
  const sinceParam = since ? `&since=${since}` : '';

  const nextMap = {};
  for (const room of rooms) {
    try {
      const res = await fetch(`/api/history?room=${encodeURIComponent(room.name)}&limit=${ROOM_HISTORY_LIMIT}${sinceParam}`);
      if (!res.ok) {
        nextMap[room.name] = [];
        continue;
      }
      const json = await res.json();
      nextMap[room.name] = json.rows || [];
    } catch {
      nextMap[room.name] = [];
    }
  }

  if (reqId !== roomHistoryRequestId) return;
  roomHistoryMap.value = nextMap;
}
</script>

