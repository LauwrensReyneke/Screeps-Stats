<template>
  <header class="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
    <div class="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div class="flex items-center gap-3">
        <div class="flex h-9 items-center rounded-lg bg-slate-900 px-2.5">
          <img :src="logo" alt="Screeps" class="h-5 w-auto" />
        </div>
        <div class="leading-tight">
          <h1 class="text-base font-extrabold tracking-tight text-slate-900">Colony overview</h1>
          <p class="text-xs font-medium text-slate-500">
            <span v-if="tick">Tick {{ fmtInt(tick) }}</span>
            <span v-if="shardCount"> · {{ shardCount }} shard{{ shardCount === 1 ? '' : 's' }}</span>
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2.5">
        <!-- range -->
        <RadioGroup :modelValue="range" @update:modelValue="$emit('update:range', $event)" class="flex rounded-lg bg-slate-100 p-0.5">
          <RadioGroupLabel class="sr-only">Time range</RadioGroupLabel>
          <RadioGroupOption v-for="opt in ranges" :key="opt.key" :value="opt.key" v-slot="{ checked }" as="template">
            <button
              type="button"
              class="rounded-md px-2.5 py-1 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
              :class="checked ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
            >{{ opt.label }}</button>
          </RadioGroupOption>
        </RadioGroup>

        <!-- shard -->
        <Listbox v-if="shards.length > 1" :modelValue="shard" @update:modelValue="$emit('update:shard', $event)" as="div" class="relative">
          <ListboxButton class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
            <font-awesome-icon :icon="faLayerGroup" class="text-slate-400" />
            {{ shard === 'all' ? 'All shards' : shard }}
            <font-awesome-icon :icon="faChevronDown" class="text-[9px] text-slate-400" />
          </ListboxButton>
          <transition leave-active-class="transition duration-100" leave-from-class="opacity-100" leave-to-class="opacity-0">
            <ListboxOptions class="absolute right-0 z-30 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg focus:outline-none">
              <ListboxOption v-for="opt in ['all', ...shards]" :key="opt" :value="opt" v-slot="{ active, selected }">
                <li class="flex cursor-pointer items-center justify-between px-3 py-1.5" :class="active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'">
                  <span :class="selected ? 'font-bold' : 'font-medium'">{{ opt === 'all' ? 'All shards' : opt }}</span>
                  <font-awesome-icon v-if="selected" :icon="faCheck" class="text-indigo-500" />
                </li>
              </ListboxOption>
            </ListboxOptions>
          </transition>
        </Listbox>

        <!-- status -->
        <div class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs">
          <span class="relative flex size-2">
            <span v-if="status === 'ok'" class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60"></span>
            <span class="relative inline-flex size-2 rounded-full" :class="dotClass"></span>
          </span>
          <span class="font-bold text-slate-700">{{ statusLabel }}</span>
          <span v-if="updatedAgo !== null" class="tabular-nums text-slate-400">{{ updatedAgo }}</span>
        </div>

        <button
          type="button"
          class="flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
          aria-label="Refresh now"
          @click="$emit('refresh')"
        >
          <font-awesome-icon :icon="faRotateRight" :class="{ 'animate-spin': refreshing }" class="text-xs" />
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue';
import { RadioGroup, RadioGroupLabel, RadioGroupOption, Listbox, ListboxButton, ListboxOptions, ListboxOption } from '@headlessui/vue';
import { faLayerGroup, faChevronDown, faCheck, faRotateRight } from '@fortawesome/free-solid-svg-icons';
import logo from '../assets/screeps.svg';
import { fmtInt } from '../lib/format.js';

const props = defineProps({
  ranges: { type: Array, required: true },
  range: { type: String, required: true },
  shards: { type: Array, default: () => [] },
  shard: { type: String, default: 'all' },
  status: { type: String, default: 'loading' },
  updatedAgo: { type: String, default: null },
  tick: { type: Number, default: 0 },
  refreshing: { type: Boolean, default: false },
});
defineEmits(['update:range', 'update:shard', 'refresh']);

const shardCount = computed(() => props.shards.length);
const statusLabel = computed(() => ({ loading: 'Connecting', ok: 'Live', stale: 'Stale', error: 'Offline' }[props.status] || props.status));
const dotClass = computed(() => ({
  ok: 'bg-emerald-500', stale: 'bg-amber-500', error: 'bg-rose-500', loading: 'bg-sky-500 animate-pulse',
}[props.status] || 'bg-slate-400'));
</script>
