<template>
  <Panel v-if="chem" title="Boost chemistry" :icon="faFlask" :subtitle="subtitle">
    <template #info>
      Other rooms with labs (satellites) make ZK or UL from their own minerals until the target is met, and
      ship it to the hub. The hub room makes GH, an upgrade boost (+50% controller progress per energy), from minerals we mine:
      Z + K → ZK, U + L → UL, ZK + UL → G, G + H → GH. It runs one step at a time in its labs, in batches of
      {{ fmtInt(chem.stepTarget || 1000) }}, and stops at {{ fmtInt(chem.target) }} GH. GH is shipped to rooms
      with a boost lab, and their upgraders are boosted as they spawn. Rate and ETA come from what the labs
      actually made over the last ~1,200 ticks.
    </template>

    <!-- Progress to target -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div v-for="t in tiles" :key="t.label" class="rounded-xl bg-slate-50 px-3 py-2.5">
        <div class="text-[11px] font-bold uppercase tracking-wide text-slate-400">{{ t.label }}</div>
        <div class="mt-0.5 text-lg font-bold tabular-nums" :class="t.tone || 'text-slate-900'">{{ t.value }}</div>
        <div class="text-xs text-slate-500">{{ t.sub }}</div>
      </div>
    </div>
    <div class="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div class="bar h-full rounded-full bg-indigo-500" :style="{ width: `${pct(stock.GH, chem.target)}%` }"></div>
    </div>

    <!-- The chain -->
    <div class="mt-5 grid items-stretch gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
      <template v-for="(col, ci) in columns" :key="col.key">
        <div class="flex flex-col gap-2">
          <div class="text-[11px] font-bold uppercase tracking-wide text-slate-400">{{ col.label }}</div>
          <div
            v-for="n in col.nodes" :key="n.res"
            class="node rounded-xl border px-3 py-2"
            :class="n.active ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-200' : (n.input ? 'border-indigo-200 bg-white' : 'border-slate-200 bg-white')"
          >
            <div class="flex items-baseline justify-between gap-2">
              <span class="flex items-center gap-1.5 font-bold text-slate-900">
                <span v-if="n.active" class="relative flex h-2 w-2">
                  <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75"></span>
                  <span class="relative inline-flex h-2 w-2 rounded-full bg-indigo-500"></span>
                </span>
                {{ n.res }}
              </span>
              <span class="tabular-nums text-sm" :class="n.low ? 'text-rose-600' : 'text-slate-600'">{{ fmtCompact(n.amount) }}</span>
            </div>
            <div v-if="n.goal" class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div class="bar h-full rounded-full" :class="n.active ? 'bg-indigo-500' : 'bg-slate-300'" :style="{ width: `${pct(n.amount, n.goal)}%` }"></div>
            </div>
            <div v-if="n.note" class="mt-1 text-[11px] text-slate-500">{{ n.note }}</div>
          </div>
        </div>
        <div v-if="ci < columns.length - 1" class="hidden items-center justify-center text-slate-300 md:flex">
          <font-awesome-icon :icon="faChevronRight" />
        </div>
      </template>
    </div>

    <!-- Labs right now -->
    <div v-if="labs" class="mt-5 rounded-xl border border-slate-200 px-4 py-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="text-sm font-bold text-slate-900">Labs in {{ chem.hub }}</div>
        <div class="text-xs text-slate-500">
          <span class="font-bold tabular-nums text-slate-900">{{ labs.reacting }}</span> of {{ labs.outputs }} outputs reacting ·
          holding {{ fmtInt(labs.holding) }}
        </div>
      </div>
      <div class="mt-2 grid gap-2 sm:grid-cols-2">
        <div v-for="(inp, i) in labs.inputs" :key="i" class="rounded-lg bg-slate-50 px-3 py-2">
          <div class="flex items-baseline justify-between text-xs">
            <span class="font-bold text-slate-600">Input {{ i === 0 ? 'A' : 'B' }} · wants {{ inp.want || '—' }}</span>
            <span class="tabular-nums" :class="inp.held && inp.held !== inp.want ? 'text-amber-600' : 'text-slate-600'">
              {{ inp.held ? `${fmtInt(inp.amount)} ${inp.held}` : 'empty' }}
            </span>
          </div>
          <div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div class="bar h-full rounded-full" :class="inp.held && inp.held !== inp.want ? 'bg-amber-400' : 'bg-emerald-500'" :style="{ width: `${pct(inp.amount, 3000)}%` }"></div>
          </div>
        </div>
      </div>
      <p v-if="labs.blocker" class="mt-2 flex items-center gap-1.5 text-xs font-bold text-amber-600">
        <font-awesome-icon :icon="faTriangleExclamation" /> {{ cap(labs.blocker) }}
      </p>
    </div>

    <!-- Satellites -->
    <div v-if="(chem.satellites || []).length" class="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <span class="font-bold uppercase tracking-wide text-slate-400">Satellites</span>
      <span v-for="s in chem.satellites" :key="s.room" class="rounded-full bg-indigo-50 px-2.5 py-1 font-bold text-indigo-700">
        {{ s.room }} · making {{ s.step }}<span v-if="s.since && tick" class="font-normal text-indigo-500"> for {{ ticksToText(tick - s.since) }}</span>
      </span>
    </div>

    <!-- Where the boost goes -->
    <div v-if="boostRooms.length" class="mt-5">
      <div class="text-[11px] font-bold uppercase tracking-wide text-slate-400">Boost rooms</div>
      <div class="mt-2 flex flex-wrap gap-2">
        <div v-for="r in boostRooms" :key="r.name" class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs">
          <span class="font-bold text-slate-900">{{ r.name }}</span>
          <span class="text-slate-500"> · {{ fmtInt(r.stock) }} in stock · </span>
          <span :class="r.boosted ? 'font-bold text-indigo-600' : 'text-slate-500'">{{ r.boosted }}/{{ r.work }} WORK boosted</span>
        </div>
      </div>
    </div>
  </Panel>
</template>

<script setup>
import { computed } from 'vue';
import { faFlask, faChevronRight, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import Panel from './Panel.vue';
import { fmtInt, fmtCompact, fmtDuration } from '../lib/format.js';

const props = defineProps({
  chem: { type: Object, default: null },
  rooms: { type: Array, default: () => [] },
  tickMs: { type: Number, default: null },
  tick: { type: Number, default: 0 },
});

const stock = computed(() => (props.chem && props.chem.stock) || {});
const labs = computed(() => (props.chem && props.chem.labs) || null);

function pct(v, of) {
  return of > 0 ? Math.max(0, Math.min(100, ((Number(v) || 0) / of) * 100)) : 0;
}
function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function ticksToText(t) {
  if (!t && t !== 0) return '—';
  return props.tickMs ? fmtDuration(t * props.tickMs) : `${fmtInt(t)} ticks`;
}

const subtitle = computed(() => {
  const c = props.chem;
  if (!c) return '';
  const since = c.stepSince && props.tick ? ` for ${ticksToText(props.tick - c.stepSince)}` : '';
  const doing = c.step ? `making ${c.step}${since}` : 'idle';
  const rate = c.rate !== null && c.rate !== undefined ? ` · ${c.rate.toFixed(1)} units/tick` : '';
  return `${c.hub} · ${doing}${rate}`;
});

const tiles = computed(() => {
  const c = props.chem;
  const gh = stock.value.GH || 0;
  return [
    { label: 'GH made', value: `${fmtCompact(gh)} / ${fmtCompact(c.target)}`, sub: `${Math.round(pct(gh, c.target))}% of the stock target`, tone: 'text-indigo-600' },
    { label: 'Lab output', value: c.rate !== null && c.rate !== undefined ? `${c.rate.toFixed(1)}/tick` : '—', sub: 'all steps, last ~1,200 ticks' },
    { label: 'To target', value: c.etaTicks ? ticksToText(c.etaTicks) : '—', sub: c.reactionsLeft !== null ? `${fmtInt(c.reactionsLeft)} reaction units left` : '' },
    {
      label: 'Minerals allow',
      value: c.possible !== null ? `${fmtCompact(c.possible)} GH` : '—',
      sub: c.possible === null || c.possible === undefined ? '' : (c.limit ? `${c.limit} runs out first` : 'enough for the target'),
      tone: c.limit ? 'text-amber-600' : null,
    },
  ];
});

const columns = computed(() => {
  const c = props.chem || {};
  const s = stock.value;
  const step = c.step;
  const inputs = c.stepInputs || [];
  const node = (res, goal, note) => ({
    res, amount: s[res] || 0, goal,
    active: step === res,
    input: inputs.includes(res),
    low: goal === undefined && (s[res] || 0) < 500,
    note,
  });
  const st = c.stepTarget || 1000;
  return [
    { key: 'base', label: 'Minerals', nodes: ['Z', 'K', 'U', 'L', 'H'].map((r) => node(r, undefined)) },
    { key: 'mid', label: 'Step 1', nodes: [node('ZK', st, 'Z + K'), node('UL', st, 'U + L')] },
    { key: 'g', label: 'Step 2', nodes: [node('G', st, 'ZK + UL')] },
    { key: 'gh', label: 'Boost', nodes: [node('GH', c.target, 'G + H')] },
  ];
});

const boostRooms = computed(() => (props.rooms || [])
  .filter((r) => r.owned && r.boostLab)
  .map((r) => ({ name: r.name, stock: r.boostStock || 0, boosted: r.boostedWork || 0, work: r.upgradeWork || 0 }))
  .sort((a, b) => a.name.localeCompare(b.name)));
</script>

<style scoped>
.bar {
  transition: width 700ms cubic-bezier(0.22, 1, 0.36, 1);
}
.node {
  transition: background-color 300ms, border-color 300ms, box-shadow 300ms;
}
</style>
