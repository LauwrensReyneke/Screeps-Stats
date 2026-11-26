<template>
  <div class="min-h-screen">
    <AppHeader
      v-model:range="range"
      v-model:shard="shard"
      :ranges="RANGES"
      :shards="shardOptions"
      :status="status"
      :updatedAgo="updatedAgo"
      :tick="data?.tick || 0"
      :refreshing="refreshing"
      @refresh="refreshAll"
    />

    <main class="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-5 py-6">
      <!-- loading -->
      <template v-if="!data && status === 'loading'">
        <div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <div v-for="i in 6" :key="i" class="card h-36 animate-pulse"></div>
        </div>
        <div class="card h-24 animate-pulse"></div>
        <div class="grid gap-5 xl:grid-cols-2"><div class="card h-96 animate-pulse"></div><div class="card h-96 animate-pulse"></div></div>
      </template>

      <!-- error with nothing to show -->
      <div v-else-if="!data" class="card px-6 py-16 text-center">
        <font-awesome-icon :icon="faPlugCircleXmark" class="text-4xl text-rose-400" />
        <p class="mt-3 text-lg font-bold text-slate-900">Can't reach the stats API</p>
        <p class="mt-1 text-sm text-slate-500">{{ errorMessage }}</p>
        <button type="button" class="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700" @click="refreshAll">Try again</button>
      </div>

      <template v-else>
        <div v-if="status === 'stale'" class="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <font-awesome-icon :icon="faClockRotateLeft" /> Showing the last good snapshot — {{ errorMessage }}
        </div>

        <!-- KPIs -->
        <section class="rise grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label="CPU" :icon="faMicrochip" :tone="cpuTone"
            :value="avgCpu.toFixed(1)" :unit="`/ ${cpuLimit}`"
            :sub="`now ${Number(data.cpu.used).toFixed(1)}`"
            :spark="history.map((r) => r.cpu_used)"
            info="Average CPU per tick over the selected range, against your limit. Above 85% of the limit, pixel generation pauses."
          />
          <KpiCard
            label="Bucket" :icon="faBucket" :tone="bucketTone"
            :value="fmtCompact(data.cpu.bucket)"
            :sub="pixelsSub"
            :spark="history.map((r) => r.cpu_bucket)"
            info="Banked CPU. With pixel generation on, it cycles 0 → 10,000 by design; a bucket that stays low while CPU is above the limit is the problem."
          />
          <KpiCard
            label="GCL" :icon="faArrowUpRightDots" tone="violet"
            :value="data.global?.gcl?.level || 0"
            :sub="gclSub"
            :spark="history.filter((r) => r.gcl_progress_total).map((r) => r.gcl_progress / r.gcl_progress_total)"
            info="Global control level: each level is one more room you may claim. The ETA uses the progress rate across the range."
          />
          <KpiCard
            label="Rooms" :icon="faLayerGroup" tone="sky"
            :value="ownedRooms.length" :unit="`/ ${data.global?.gcl?.level || '—'}`"
            :sub="roomsSub"
            :spark="history.map((r) => r.owned_rooms || r.total_rooms)"
            info="Rooms owned against the GCL cap. A free slot means the colony may expand."
          />
          <KpiCard
            label="Creeps" :icon="faUsers" tone="indigo"
            :value="fmtInt(data.totals?.creeps || 0)"
            :sub="data.cpuPerCreep ? `${data.cpuPerCreep.toFixed(3)} CPU each` : ''"
            :spark="history.map((r) => r.total_creeps)"
            info="Total creeps and CPU per creep. One game action costs 0.2 CPU, so ~0.2 per creep is near the floor."
          />
          <KpiCard
            label="Credits" :icon="faCoins" tone="emerald"
            :value="fmtCompact(data.global?.credits || 0)"
            :delta="creditsDelta"
            :sub="marketSub"
            :spark="history.map((r) => r.credits)"
            info="Market credits, with the change over the selected range, and what the bot has spent buying energy and upgrade boosts in its current budget window."
          />
        </section>

        <AlertsPanel class="rise" style="animation-delay: 60ms" :alerts="alerts" @open-room="openRoom" />

        <!-- Keyed by range: a range switch remounts the time-series charts. Updated
             in place, ApexCharts kept the old range's axes (a 24h series drawn on
             the 1h x-axis, its y-axis clipped). The key is the range of the data
             on screen, so the remount comes with the new data, not before it.
             Refreshes still update in place. -->
        <GclPanel :key="`gcl-${loadedRange}`" class="rise" style="animation-delay: 120ms" :history="history" :roomSeries="roomSeries" :rooms="rooms" :boostStatus="data.global?.market?.boostBuyStatus || null" :chem="data.global?.chem || null" :gclExport="data.global?.gclExport || []" />

        <RemotePanel class="rise" style="animation-delay: 150ms" :remote="data.global?.remote || {}" />

        <section :key="`charts-${loadedRange}`" class="rise grid items-start gap-5 xl:grid-cols-2" style="animation-delay: 180ms">
          <CpuPanel :history="history" :data="data" />
          <ColonyPanel :history="history" :roomSeries="roomSeries" :ownedRooms="ownedRooms.map((r) => r.name)" />
        </section>

        <RoomsTable class="rise" style="animation-delay: 240ms" :rooms="rooms" :roomSeries="roomSeries" @open="openRoom" />

        <p class="pb-2 text-center text-xs text-slate-400">
          {{ history.length }} points over {{ rangeLabel }}<span v-if="bucketMs"> · one point per {{ fmtDuration(bucketMs) }}</span>
          <span v-if="data.memoryBytes"> · Memory {{ fmtBytes(data.memoryBytes) }}</span>
        </p>
      </template>
    </main>

    <RoomDrawer :open="!!drawerRoom" :room="drawerRoom" :series="drawerRoom ? (roomSeries[drawerRoom.name] || []) : []" @close="drawerRoomName = null" />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  faMicrochip, faBucket, faArrowUpRightDots, faLayerGroup, faUsers, faCoins, faPlugCircleXmark, faClockRotateLeft,
} from '@fortawesome/free-solid-svg-icons';
import AppHeader from './components/AppHeader.vue';
import KpiCard from './components/KpiCard.vue';
import AlertsPanel from './components/AlertsPanel.vue';
import CpuPanel from './components/CpuPanel.vue';
import ColonyPanel from './components/ColonyPanel.vue';
import RoomsTable from './components/RoomsTable.vue';
import RoomDrawer from './components/RoomDrawer.vue';
import GclPanel from './components/GclPanel.vue';
import RemotePanel from './components/RemotePanel.vue';
import { fmtInt, fmtCompact, fmtDuration, fmtBytes, fmtSigned } from './lib/format.js';
import { buildAlerts, currentEta } from './lib/derive.js';
import { usePref } from './lib/prefs.js';

const RANGES = [
  { key: '1h', label: '1h', ms: 3_600_000 },
  { key: '6h', label: '6h', ms: 6 * 3_600_000 },
  { key: '24h', label: '24h', ms: 24 * 3_600_000 },
  { key: '7d', label: '7d', ms: 7 * 24 * 3_600_000 },
  { key: '30d', label: '30d', ms: 30 * 24 * 3_600_000 },
  { key: 'all', label: 'All', ms: null },
];
const GLOBAL_POINTS = 240;
const ROOM_POINTS = 120;
// The API reads the stats segment at most once a minute.
const POLL_MS = 60_000;

const range = usePref('range', '24h');
const shard = usePref('shard', 'all');

const data = ref(null);
const status = ref('loading');
const errorMessage = ref('');
const lastUpdated = ref(null);
const now = ref(Date.now());
const refreshing = ref(false);

const history = ref([]);
// The range the history on screen belongs to (set when it arrives).
const loadedRange = ref(null);
const bucketMs = ref(0);
const roomSeries = ref({});
const drawerRoomName = ref(null);

// ── fetching ───────────────────────────────────────────────────────────────
function sinceMs() {
  const opt = RANGES.find((r) => r.key === range.value);
  return opt?.ms ? Date.now() - opt.ms : 0;
}

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

async function fetchStats() {
  try {
    data.value = await getJson('/api/stats');
    lastUpdated.value = Date.now();
    status.value = 'ok';
    errorMessage.value = '';
  } catch (err) {
    errorMessage.value = err.message || 'Unknown error';
    status.value = data.value ? 'stale' : 'error';
  }
}

let historyRequest = 0;
async function fetchHistory() {
  const id = ++historyRequest;
  const since = sinceMs();
  const forRange = range.value;
  try {
    const [g, r] = await Promise.all([
      getJson(`/api/history?since=${since}&points=${GLOBAL_POINTS}`),
      getJson(`/api/history?since=${since}&points=${ROOM_POINTS}&scope=rooms`),
    ]);
    if (id !== historyRequest) return;   // a newer range was selected meanwhile
    history.value = g.rows || [];
    bucketMs.value = g.bucketMs || 0;
    roomSeries.value = r.rooms || {};
    loadedRange.value = forRange;
  } catch {
    // History is supplementary; the live snapshot still renders.
  }
}

async function refreshAll() {
  refreshing.value = true;
  await fetchStats();
  await fetchHistory();
  refreshing.value = false;
}

let pollTimer = null;
let clockTimer = null;
onMounted(() => {
  refreshAll();
  pollTimer = setInterval(refreshAll, POLL_MS);
  clockTimer = setInterval(() => { now.value = Date.now(); }, 5000);
});
onUnmounted(() => { clearInterval(pollTimer); clearInterval(clockTimer); });
watch(range, fetchHistory);

// ── derived ────────────────────────────────────────────────────────────────
const shardOptions = computed(() => [...new Set((data.value?.rooms || []).map((r) => r.shard || 'unknown'))].sort());
watch(shardOptions, (opts) => { if (shard.value !== 'all' && !opts.includes(shard.value)) shard.value = 'all'; });

const rooms = computed(() => (data.value?.rooms || [])
  .filter((r) => shard.value === 'all' || r.shard === shard.value)
  // An API from before `owned` existed: a room with a controller level is ours.
  .map((r) => (r.owned === undefined ? { ...r, owned: r.rcl > 0 } : r)));
const ownedRooms = computed(() => rooms.value.filter((r) => r.owned));

const updatedAgo = computed(() => {
  if (!lastUpdated.value) return null;
  const s = Math.max(0, Math.round((now.value - lastUpdated.value) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
});

const rangeLabel = computed(() => (range.value === 'all' ? 'all history' : `the last ${range.value}`));

const cpuLimit = computed(() => Number(data.value?.cpu?.limit) || 20);
const avgCpu = computed(() => {
  const h = history.value;
  return h.length ? h.reduce((s, r) => s + (Number(r.cpu_used) || 0), 0) / h.length : Number(data.value?.cpu?.used) || 0;
});
const cpuTone = computed(() => (avgCpu.value > cpuLimit.value ? 'rose' : avgCpu.value > cpuLimit.value * 0.85 ? 'amber' : 'emerald'));
const bucketTone = computed(() => ((data.value?.cpu?.bucket ?? 10000) < 1000 && avgCpu.value > cpuLimit.value ? 'rose' : 'sky'));

const pixelsSub = computed(() => {
  const px = data.value?.global?.pixels;
  const first = history.value.find((r) => r.pixels !== null && r.pixels !== undefined);
  const last = history.value.at(-1);
  if (px === undefined) return 'pixel count not reported';
  const gained = first && last && last.pixels !== null ? last.pixels - first.pixels : null;
  return gained > 0 ? `${fmtInt(px)} pixels · +${gained} in range` : `${fmtInt(px)} pixels`;
});

const gclEta = computed(() => currentEta(history.value.filter((r) => r.gcl_progress_total > 0),
  { progress: 'gcl_progress', total: 'gcl_progress_total', level: 'gcl_level' }));
const gclSub = computed(() => {
  const g = data.value?.global?.gcl;
  if (!g?.progressTotal) return '';
  const pct = `${Math.round((g.progress / g.progressTotal) * 100)}%`;
  return gclEta.value?.msLeft ? `${pct} · next in ${fmtDuration(gclEta.value.msLeft)}` : pct;
});

const roomsSub = computed(() => {
  const free = (data.value?.global?.gcl?.level || 0) - ownedRooms.value.length;
  return free > 0 ? `${free} free slot${free === 1 ? '' : 's'}` : 'at the GCL cap';
});

const creditsDelta = computed(() => {
  const h = history.value;
  if (h.length < 2) return null;
  const d = h.at(-1).credits - h[0].credits;
  return { text: fmtSigned(d), direction: d > 0 ? 'up' : d < 0 ? 'down' : 'flat', good: d === 0 ? null : d > 0 };
});

const marketSub = computed(() => {
  const m = data.value?.global?.market;
  if (!m) return '';
  const parts = [];
  if (m.energySpent) parts.push(`${fmtCompact(m.energySpent)} on energy`);
  if (m.boostSpent) parts.push(`${fmtCompact(m.boostSpent)} on boosts`);
  if (parts.length) return `spent ${parts.join(', ')}`;
  // Not buying: say why (the bot reports the reason), so a silent buyer
  // is visible.
  return m.energyBuyStatus ? `not buying: ${m.energyBuyStatus}` : 'no buying this window';
});

const alerts = computed(() => buildAlerts({ data: data.value ? { ...data.value, rooms: rooms.value } : null, history: history.value }));

// ── drawer ─────────────────────────────────────────────────────────────────
const drawerRoom = computed(() => rooms.value.find((r) => r.name === drawerRoomName.value) || null);
function openRoom(name) { drawerRoomName.value = name; }
</script>
