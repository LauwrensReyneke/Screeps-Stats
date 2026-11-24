<template>
  <div class="flex items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400" :style="{ height: `${height}px` }">
    <slot>Collecting history — this fills in as snapshots arrive.</slot>
  </div>
</template>

<script setup>
defineProps({ height: { type: Number, default: 280 } });
</script>
