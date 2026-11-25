<template>
  <Panel v-if="rows.length" title="Remote mining" :icon="faRoute" :subtitle="subtitle">
    <template #info>
      Energy brought home from unowned neighbouring rooms, per operation. Each one is judged on
      <b>net energy per CPU</b> (delivered minus what its creeps cost to spawn, over the CPU its creeps used)
      after a setup window, and paused below {{ MIN_EPC }}. A home miner returns about 90.
      Remote creeps only spawn while average CPU stays under the pixel line.
    </template>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="text-left text-[11px] uppercase tracking-wide text-slate-400">
          <tr>
            <th class="py-1.5 pr-3 font-bold">Room</th>
            <th class="py-1.5 pr-3 font-bold">State</th>
            <th class="py-1.5 pr-3 text-right font-bold">Energy/tick</th>
            <th class="py-1.5 pr-3 text-right font-bold">CPU/tick</th>
            <th class="py-1.5 pr-3 text-right font-bold">Net energy/CPU</th>
            <th class="py-1.5 text-right font-bold">Trip</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.name" class="border-t border-slate-100">
            <td class="py-2 pr-3">
              <span class="font-bold text-slate-900">{{ r.name }}</span>
              <span class="text-slate-400"> → {{ r.home }}</span>
              <span v-if="r.reserved" class="ml-1.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600">reserved</span>
            </td>
            <td class="py-2 pr-3">
              <span class="rounded-full px-2 py-0.5 text-[11px] font-bold" :class="STATE[r.state]">{{ r.state }}</span>
            </td>
            <td class="py-2 pr-3 text-right tabular-nums">{{ r.rate.toFixed(1) }}</td>
            <td class="py-2 pr-3 text-right tabular-nums">{{ r.cpuRate.toFixed(2) }}</td>
            <td class="py-2 pr-3 text-right tabular-nums" :class="r.epc !== null && r.epc < MIN_EPC ? 'text-rose-600' : 'text-slate-900'">
              {{ r.epc === null ? '—' : r.epc }}
            </td>
            <td class="py-2 text-right tabular-nums text-slate-500">{{ r.trip }} t</td>
          </tr>
        </tbody>
      </table>
    </div>
  </Panel>
</template>

<script setup>
import { computed } from 'vue';
import { faRoute } from '@fortawesome/free-solid-svg-icons';
import Panel from './Panel.vue';

const props = defineProps({ remote: { type: Object, default: () => ({}) } });

const MIN_EPC = 30;
const STATE = {
  setup: 'bg-sky-100 text-sky-700',
  running: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-slate-100 text-slate-500',
};

const rows = computed(() => Object.entries(props.remote || {}).map(([name, o]) => {
  const window = Math.max(1, o.window || 0);
  return {
    name,
    home: o.home,
    state: !o.active ? 'paused' : (o.judged ? 'running' : 'setup'),
    rate: (o.energy || 0) / window,
    cpuRate: (o.cpu || 0) / window,
    epc: o.epc,
    trip: o.trip,
    reserved: o.reserved,
  };
}));

const subtitle = computed(() => {
  const running = rows.value.filter((r) => r.state !== 'paused');
  const e = running.reduce((s, r) => s + r.rate, 0);
  const c = running.reduce((s, r) => s + r.cpuRate, 0);
  return `${running.length} active · ${e.toFixed(1)} energy/tick for ${c.toFixed(2)} CPU`;
});
</script>
