<template>
  <section class="card flex flex-col">
    <header class="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <font-awesome-icon v-if="icon" :icon="icon" class="text-sm text-indigo-500" />
          <h2 class="text-[15px] font-bold text-slate-900">{{ title }}</h2>
          <InfoPopover v-if="$slots.info" :label="`About ${title}`"><slot name="info" /></InfoPopover>
        </div>
        <p v-if="subtitle" class="mt-0.5 text-xs text-slate-500">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="flex items-center gap-2"><slot name="actions" /></div>
    </header>
    <div class="flex-1 px-5 pb-5 pt-3"><slot /></div>
  </section>
</template>

<script setup>
import InfoPopover from './InfoPopover.vue';

defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  icon: { type: [Object, Array, String], default: null },
});
</script>
