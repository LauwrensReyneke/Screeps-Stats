<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-xs font-bold uppercase tracking-widest text-slate-400">CPU Phases</h2>
      <span class="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-500">{{ totalMs.toFixed(2) }} ms</span>
    </div>

    <div v-if="!sortedPhases.length" class="py-2 text-xs italic text-slate-400">
      No phase data available.
    </div>

    <div v-for="phase in sortedPhases" :key="phase.name" class="mb-3.5 last:mb-0">
      <div class="mb-1.5 flex items-baseline gap-2">
        <span class="flex-1 truncate text-xs font-semibold text-slate-700">{{ phase.name }}</span>
        <span class="text-[10px] tabular-nums text-slate-400">{{ phase.duration.toFixed(2) }} ms</span>
        <span class="w-9 text-right text-[10px] tabular-nums font-bold text-slate-500">{{ pct(phase.duration) }}%</span>
      </div>
      <div class="h-1 overflow-hidden rounded-full bg-slate-100">
        <div
          class="h-full rounded-full transition-all duration-500"
          :style="{ width: pct(phase.duration) + '%', background: colorFor(phase.name), boxShadow: `0 0 8px ${colorFor(phase.name)}35` }"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  phases: { type: Array, default: () => [] },
});

const PHASE_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#0ea5e9', '#22c55e', '#fb923c',
];

const colorFor = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return PHASE_COLORS[Math.abs(hash) % PHASE_COLORS.length];
};

const sortedPhases = computed(() => [...props.phases].sort((a, b) => b.duration - a.duration));
const totalMs = computed(() => props.phases.reduce((sum, p) => sum + p.duration, 0));
const pct = (ms) => (!totalMs.value ? 0 : Math.min(100, (ms / totalMs.value) * 100).toFixed(1));
</script>
