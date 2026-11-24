<template>
  <TabGroup :selectedIndex="index" @change="(i) => $emit('update:modelValue', tabs[i].key)">
    <TabList class="flex rounded-lg bg-slate-100 p-0.5">
      <Tab v-for="t in tabs" :key="t.key" v-slot="{ selected }" as="template">
        <button
          type="button"
          class="rounded-md px-2.5 py-1 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
          :class="selected ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
        >{{ t.label }}</button>
      </Tab>
    </TabList>
  </TabGroup>
</template>

<script setup>
import { computed } from 'vue';
import { TabGroup, TabList, Tab } from '@headlessui/vue';

const props = defineProps({
  tabs: { type: Array, required: true },
  modelValue: { type: String, required: true },
});
defineEmits(['update:modelValue']);

const index = computed(() => Math.max(0, props.tabs.findIndex((t) => t.key === props.modelValue)));
</script>
