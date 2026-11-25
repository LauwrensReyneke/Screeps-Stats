<template>
  <Panel title="Rooms" :icon="faTableCells" :subtitle="`${visibleRooms.length} shown · select a room for detail`">
    <template #actions>
      <SwitchGroup as="div" class="flex items-center gap-2">
        <Switch
          v-model="ownedOnly"
          class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
          :class="ownedOnly ? 'bg-indigo-600' : 'bg-slate-300'"
        >
          <span class="inline-block size-4 rounded-full bg-white shadow transition-transform" :class="ownedOnly ? 'translate-x-4' : 'translate-x-0.5'" />
        </Switch>
        <SwitchLabel class="cursor-pointer text-xs font-bold text-slate-600">Owned only</SwitchLabel>
      </SwitchGroup>
    </template>

    <div v-if="!visibleRooms.length" class="py-10 text-center text-sm text-slate-400">No rooms to show.</div>

    <div v-else class="-mx-5 overflow-x-auto">
      <table class="w-full min-w-[920px] text-sm">
        <thead>
          <tr class="border-y border-slate-100 bg-slate-50/70 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <th v-for="c in COLUMNS" :key="c.key" class="px-4 py-2.5" :class="c.align === 'right' ? 'text-right' : ''">
              <button v-if="c.sort" type="button" class="inline-flex items-center gap-1 hover:text-slate-800" :class="sortKey === c.key ? 'text-indigo-600' : ''" @click="sortBy(c.key)">
                {{ c.label }}
                <font-awesome-icon v-if="sortKey === c.key" :icon="sortDir === 'asc' ? faArrowUp : faArrowDown" class="text-[9px]" />
              </button>
              <span v-else>{{ c.label }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="room in sortedRooms"
            :key="room.name"
            class="cursor-pointer border-b border-slate-100 transition-colors hover:bg-indigo-50/40"
            @click="$emit('open', room.name)"
          >
            <td class="px-4 py-2.5">
              <div class="flex items-center gap-2">
                <span class="font-bold text-slate-900">{{ room.name }}</span>
                <span v-if="!room.owned" class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500">remote</span>
              </div>
              <div class="text-[11px] text-slate-400">{{ room.shard }}<span v-if="room.policy"> · {{ room.policy }}</span></div>
            </td>

            <td class="px-4 py-2.5">
              <template v-if="room.owned && room.rcl">
                <div class="flex items-center gap-2">
                  <span class="inline-flex size-6 items-center justify-center rounded-md bg-indigo-50 text-xs font-extrabold text-indigo-700">{{ room.rcl }}</span>
                  <div class="w-28">
                    <div class="h-1.5 rounded-full bg-slate-100">
                      <div class="h-1.5 rounded-full bg-indigo-500" :style="{ width: `${rclPct(room) * 100}%` }"></div>
                    </div>
                    <div class="mt-0.5 text-[11px] text-slate-500">{{ room.rcl >= 8 ? 'max level' : rclEtaText(room) }}</div>
                  </div>
                </div>
              </template>
              <span v-else class="text-slate-300">—</span>
            </td>

            <td class="px-4 py-2.5">
              <template v-if="room.energyCapacity">
                <div class="w-24">
                  <div class="h-1.5 rounded-full bg-slate-100">
                    <div class="h-1.5 rounded-full" :class="fillClass(room)" :style="{ width: `${fill(room) * 100}%` }"></div>
                  </div>
                  <div class="mt-0.5 text-[11px] tabular-nums text-slate-500">{{ fmtCompact(room.energy) }} / {{ fmtCompact(room.energyCapacity) }}</div>
                </div>
              </template>
              <span v-else class="text-slate-300">—</span>
            </td>

            <td class="px-4 py-2.5 text-right">
              <div class="font-bold tabular-nums text-slate-900">{{ fmtCompact(stored(room)) }}</div>
              <div v-if="storedDelta(room) !== null" class="text-[11px] font-semibold tabular-nums" :class="storedDelta(room) >= 0 ? 'text-emerald-600' : 'text-rose-600'">
                {{ fmtSigned(storedDelta(room)) }}
              </div>
            </td>

            <td class="px-4 py-2.5 text-right tabular-nums text-slate-700">{{ room.creeps }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums" :class="room.gclFocus ? 'font-bold text-violet-700' : 'text-slate-700'">
              <span class="inline-flex items-center justify-end gap-1.5">
                <font-awesome-icon
                  v-if="room.boostedWork > 0" :icon="faBolt" class="text-[10px] text-emerald-500"
                  :title="`${room.boostedWork}/${room.upgradeWork} upgrader WORK boosted`"
                />
                {{ room.upgradePerTick ? `${room.upgradePerTick.toFixed(1)}/t` : '—' }}
              </span>
            </td>
            <td class="px-4 py-2.5 text-right tabular-nums text-slate-700">{{ room.cpuTotal ? room.cpuTotal.toFixed(2) : '—' }}</td>

            <td class="px-4 py-2.5">
              <div class="flex flex-wrap gap-1">
                <span v-if="room.distress?.length" class="badge bg-rose-100 text-rose-700"><font-awesome-icon :icon="faHeartPulse" />distressed</span>
                <span v-if="room.hostiles > 0" class="badge" :class="room.hostileOffence > 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'">
                  <font-awesome-icon :icon="faShieldHalved" />{{ room.hostiles }} hostile
                </span>
                <span v-if="room.gclFocus" class="badge bg-violet-100 text-violet-700"><font-awesome-icon :icon="faArrowUpRightDots" />GCL focus</span>
                <span v-if="room.safeMode > 0" class="badge bg-sky-100 text-sky-700"><font-awesome-icon :icon="faLock" />safe mode</span>
                <span v-if="isStarved(room)" class="badge bg-amber-100 text-amber-700"><font-awesome-icon :icon="faBatteryEmpty" />starved</span>
                <span v-if="towersLow(room)" class="badge" :class="room.hostiles > 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'"><font-awesome-icon :icon="faTowerObservation" />towers low</span>
                <span v-if="room.owned && !room.distress?.length && !(room.hostiles > 0) && !(room.safeMode > 0) && !isStarved(room) && !towersLow(room)" class="badge bg-emerald-50 text-emerald-700">
                  <font-awesome-icon :icon="faCheck" />healthy
                </span>
              </div>
            </td>

            <td class="px-4 py-2.5 text-right">
              <a
                :href="`https://screeps.com/a/#!/room/${room.shard}/${room.name}`"
                target="_blank"
                rel="noopener"
                class="text-slate-400 hover:text-indigo-600"
                :aria-label="`Open ${room.name} in Screeps`"
                @click.stop
              ><font-awesome-icon :icon="faArrowUpRightFromSquare" class="text-xs" /></a>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </Panel>
</template>

<script setup>
import { computed, ref } from 'vue';
import { Switch, SwitchGroup, SwitchLabel } from '@headlessui/vue';
import {
  faTableCells, faArrowUp, faArrowDown, faHeartPulse, faShieldHalved, faLock, faCheck, faArrowUpRightFromSquare, faBatteryEmpty, faTowerObservation, faArrowUpRightDots, faBolt,
} from '@fortawesome/free-solid-svg-icons';
import Panel from './Panel.vue';
import { fmtCompact, fmtSigned, fmtDuration } from '../lib/format.js';
import { progressEta, storedEnergy, isStarved, towersLow } from '../lib/derive.js';
import { usePref } from '../lib/prefs.js';

const props = defineProps({
  rooms: { type: Array, default: () => [] },
  roomSeries: { type: Object, default: () => ({}) },
});
defineEmits(['open']);

const COLUMNS = [
  { key: 'name', label: 'Room', sort: true },
  { key: 'rcl', label: 'Controller', sort: true },
  { key: 'fill', label: 'Spawn energy', sort: true },
  { key: 'stored', label: 'Stored', sort: true, align: 'right' },
  { key: 'creeps', label: 'Creeps', sort: true, align: 'right' },
  { key: 'upgrade', label: 'Upgrade', sort: true, align: 'right' },
  { key: 'cpu', label: 'CPU', sort: true, align: 'right' },
  { key: 'status', label: 'Status', sort: true },
  { key: 'link', label: '' },
];

const ownedOnly = usePref('ownedOnly', true);
const sortKey = ref('status');
const sortDir = ref('desc');

const visibleRooms = computed(() => props.rooms.filter((r) => !ownedOnly.value || r.owned));

const fill = (r) => (r.energyCapacity ? Math.min(1, r.energy / r.energyCapacity) : 0);
const stored = (r) => storedEnergy(r);
const rclPct = (r) => (r.controllerProgressTotal ? Math.min(1, r.controllerProgress / r.controllerProgressTotal) : 1);
const fillClass = (r) => (fill(r) >= 0.7 ? 'bg-emerald-500' : fill(r) >= 0.3 ? 'bg-amber-500' : 'bg-rose-500');

function storedDelta(r) {
  const s = props.roomSeries[r.name];
  if (!s || s.length < 2) return null;
  const v = (p) => (p.storage_energy || 0) + (p.terminal_energy || 0);
  return v(s.at(-1)) - v(s[0]);
}

function rclEtaText(r) {
  const eta = progressEta(props.roomSeries[r.name], { progress: 'controller_progress', total: 'controller_progress_total', level: 'rcl' });
  const pct = `${Math.round(rclPct(r) * 100)}%`;
  return eta && eta.msLeft ? `${pct} · ${fmtDuration(eta.msLeft)}` : pct;
}

const statusScore = (r) => (r.distress?.length ? 100 : 0) + (r.hostileOffence > 0 ? 50 : 0) + (r.hostiles > 0 ? 10 : 0) + (isStarved(r) ? 8 : 0) + (towersLow(r) ? (r.hostiles > 0 ? 60 : 7) : 0) + (r.safeMode > 0 ? 5 : 0);

const SORTERS = {
  name: (r) => r.name,
  rcl: (r) => r.rcl + rclPct(r),
  fill: fill,
  stored: stored,
  creeps: (r) => r.creeps,
  cpu: (r) => r.cpuTotal || 0,
  upgrade: (r) => r.upgradePerTick || 0,
  status: statusScore,
};

function sortBy(key) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  else { sortKey.value = key; sortDir.value = key === 'name' ? 'asc' : 'desc'; }
}

const sortedRooms = computed(() => {
  const fn = SORTERS[sortKey.value] || SORTERS.name;
  const dir = sortDir.value === 'asc' ? 1 : -1;
  return [...visibleRooms.value].sort((a, b) => {
    const x = fn(a); const y = fn(b);
    if (x < y) return -dir;
    if (x > y) return dir;
    return a.name.localeCompare(b.name);
  });
});
</script>
