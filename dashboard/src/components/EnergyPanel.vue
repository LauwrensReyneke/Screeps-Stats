<template>
  <Panel v-if="total" title="Where the energy goes" :icon="faBolt" :subtitle="subtitle">
    <template #info>
      Energy per tick, averaged over about 500 ticks. Spawning, terminal sends and market freight are
      counted exactly; harvest, upgrading, building, repairs and tower shots are sampled from the event
      log every 10 ticks. <b>Banked</b> is the change in storage and terminal energy.
      <b>Unaccounted</b> is what is left over: energy filling or leaving extensions, containers and
      creeps, or dropped energy decaying. It should stay small; a large figure is a leak with no name yet.
      Energy shipped between our own rooms is left out of the colony total.
    </template>

    <!-- Colony: where it comes from, where it goes -->
    <div class="space-y-3">
      <div v-for="side in sides" :key="side.key">
        <div class="mb-1 flex items-baseline justify-between text-[11px] font-bold uppercase tracking-wide text-slate-400">
          <span>{{ side.label }}</span>
          <span class="tabular-nums text-slate-500">{{ fmt(side.sum) }} / tick</span>
        </div>
        <div class="flex h-7 w-full overflow-hidden rounded-lg bg-slate-100">
          <div
            v-for="seg in side.segments" :key="seg.key"
            class="seg flex items-center justify-center overflow-hidden text-[10px] font-bold text-white"
            :class="seg.cls"
            :style="{ width: `${seg.pct}%` }"
            :title="`${seg.label}: ${fmt(seg.value)} / tick (${seg.pct.toFixed(0)}%)`"
          >
            <span v-if="seg.pct >= 9" class="truncate px-1">{{ seg.short }}</span>
          </div>
        </div>
      </div>
      <ul class="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-slate-600">
        <li v-for="seg in legend" :key="seg.key" class="flex items-center gap-1.5">
          <span class="h-2.5 w-2.5 rounded-sm" :class="seg.cls"></span>
          {{ seg.label }} <span class="tabular-nums text-slate-400">{{ fmt(seg.value) }}</span>
        </li>
      </ul>
    </div>

    <!-- Per room -->
    <div class="mt-5 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="text-left text-[11px] uppercase tracking-wide text-slate-400">
          <tr>
            <th class="py-1.5 pr-3 font-bold">Room</th>
            <th class="py-1.5 pr-3 text-right font-bold">In / tick</th>
            <th class="w-1/2 py-1.5 pr-3 font-bold">Where it goes</th>
            <th class="py-1.5 pr-3 text-right font-bold">To controller</th>
            <th class="py-1.5 text-right font-bold">Unaccounted</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.name" class="border-t border-slate-100">
            <td class="py-2 pr-3 font-bold text-slate-900">{{ r.name }}</td>
            <td class="py-2 pr-3 text-right tabular-nums">{{ fmt(r.in) }}</td>
            <td class="py-2 pr-3">
              <div class="flex h-3 w-full overflow-hidden rounded bg-slate-100">
                <div
                  v-for="seg in r.segments" :key="seg.key"
                  class="seg" :class="seg.cls"
                  :style="{ width: `${seg.pct}%` }"
                  :title="`${seg.label}: ${fmt(seg.value)} / tick (${seg.pct.toFixed(0)}%)`"
                ></div>
              </div>
            </td>
            <td class="py-2 pr-3 text-right tabular-nums" :class="r.upgradeShare < 0.3 ? 'text-rose-600' : 'text-slate-900'">
              {{ (r.upgradeShare * 100).toFixed(0) }}%
            </td>
            <td class="py-2 text-right tabular-nums" :class="Math.abs(r.other) > Math.max(5, r.in * 0.15) ? 'text-amber-600' : 'text-slate-500'">
              {{ fmtSigned(r.other) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </Panel>
</template>

<script setup>
import { computed } from 'vue';
import { faBolt } from '@fortawesome/free-solid-svg-icons';
import Panel from './Panel.vue';

const props = defineProps({ energy: { type: Object, default: null } });

// Sources of energy, then its uses. Colours: violet is GCL, warm colours are
// upkeep, blue is logistics.
const SOURCES = [
  { key: 'harvest', label: 'Harvest', short: 'harvest', cls: 'bg-emerald-500' },
  { key: 'remote', label: 'Remote mining', short: 'remote', cls: 'bg-teal-500' },
  { key: 'received', label: 'Received', short: 'received', cls: 'bg-cyan-500' },
  { key: 'bought', label: 'Bought', short: 'bought', cls: 'bg-lime-500' },
  { key: 'drawn', label: 'Drawn from stores', short: 'stores', cls: 'bg-slate-400' },
  { key: 'otherIn', label: 'Unaccounted (in)', short: '?', cls: 'bg-slate-300' },
];
const USES = [
  { key: 'upgrade', label: 'Upgrading', short: 'upgrade', cls: 'bg-violet-500' },
  { key: 'spawn', label: 'Spawning', short: 'spawn', cls: 'bg-indigo-400' },
  { key: 'build', label: 'Building', short: 'build', cls: 'bg-amber-500' },
  { key: 'repair', label: 'Creep repairs', short: 'repair', cls: 'bg-orange-400' },
  { key: 'towerRepair', label: 'Tower repairs', short: 'towers', cls: 'bg-rose-400' },
  { key: 'towerDefense', label: 'Tower defence', short: 'defence', cls: 'bg-rose-600' },
  { key: 'linkLoss', label: 'Link losses', short: 'links', cls: 'bg-slate-500' },
  { key: 'sent', label: 'Sent away', short: 'sent', cls: 'bg-sky-400' },
  { key: 'freight', label: 'Freight', short: 'freight', cls: 'bg-sky-600' },
  { key: 'banked', label: 'Banked', short: 'banked', cls: 'bg-emerald-300' },
  { key: 'otherOut', label: 'Unaccounted (out)', short: '?', cls: 'bg-slate-300' },
];

// Banked and unaccounted can be negative: a room drawing on its stores, or
// energy the ledger cannot place arriving. Those count as sources.
function split(v) {
  const o = { ...v };
  o.drawn = Math.max(0, -(v.banked || 0));
  o.banked = Math.max(0, v.banked || 0);
  o.otherIn = Math.max(0, -(v.other || 0));
  o.otherOut = Math.max(0, v.other || 0);
  return o;
}

function segments(v, defs) {
  const sum = defs.reduce((s, d) => s + Math.max(0, v[d.key] || 0), 0);
  return {
    sum,
    segments: defs
      .map((d) => ({ ...d, value: Math.max(0, v[d.key] || 0) }))
      .filter((d) => d.value > 0)
      .map((d) => ({ ...d, pct: sum > 0 ? (d.value / sum) * 100 : 0 })),
  };
}

const total = computed(() => (props.energy && props.energy.total && props.energy.total.in > 0 ? split(props.energy.total) : null));

const sides = computed(() => {
  if (!total.value) return [];
  return [
    { key: 'in', label: 'Comes from', ...segments(total.value, SOURCES) },
    { key: 'out', label: 'Goes to', ...segments(total.value, USES) },
  ];
});

const legend = computed(() => sides.value.flatMap((s) => s.segments));

const rows = computed(() => Object.entries((props.energy && props.energy.rooms) || {})
  .map(([name, v]) => {
    const s = split(v);
    const inn = SOURCES.reduce((n, d) => n + Math.max(0, s[d.key] || 0), 0);
    return {
      name,
      in: v.in || 0,
      other: v.other || 0,
      upgradeShare: inn > 0 ? (v.upgrade || 0) / inn : 0,
      segments: segments(s, USES).segments,
    };
  })
  .sort((a, b) => b.in - a.in));

const subtitle = computed(() => {
  if (!total.value) return '';
  const t = props.energy.total;
  const share = t.in > 0 ? Math.round(((t.upgrade || 0) / t.in) * 100) : 0;
  return `${fmt(t.upgrade || 0)} of ${fmt(t.in)} energy/tick reaches a controller (${share}%)`;
});

function fmt(n) {
  const v = Number(n) || 0;
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1);
}

function fmtSigned(n) {
  const v = Number(n) || 0;
  return `${v > 0 ? '+' : ''}${fmt(v)}`;
}
</script>

<style scoped>
.seg {
  transition: width 600ms cubic-bezier(0.22, 1, 0.36, 1);
}
.seg + .seg {
  box-shadow: inset 1px 0 0 rgb(255 255 255 / 0.6);
}
</style>
