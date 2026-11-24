<template>
  <section class="card px-5 py-4">
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <font-awesome-icon :icon="alerts.length ? faBell : faCircleCheck" :class="alerts.length ? 'text-amber-500' : 'text-emerald-500'" />
        <h2 class="text-[15px] font-bold text-slate-900">{{ alerts.length ? 'Needs attention' : 'All clear' }}</h2>
        <span v-if="counts.critical" class="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">{{ counts.critical }} critical</span>
        <span v-if="counts.warning" class="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">{{ counts.warning }} warning</span>
      </div>
      <button
        v-if="alerts.length > COLLAPSED"
        type="button"
        class="text-xs font-bold text-indigo-600 hover:text-indigo-800"
        @click="expanded = !expanded"
      >{{ expanded ? 'Show less' : `Show all ${alerts.length}` }}</button>
    </div>

    <p v-if="!alerts.length" class="mt-1 text-sm text-slate-500">
      No distressed rooms, no attacks, no decaying controllers, CPU within its limit.
    </p>

    <ul v-else class="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      <li
        v-for="(a, i) in visible"
        :key="i"
        class="flex items-start gap-2.5 rounded-lg border px-3 py-2"
        :class="STYLE[a.level].box"
      >
        <font-awesome-icon :icon="STYLE[a.level].icon" class="mt-0.5 text-sm" :class="STYLE[a.level].fg" />
        <div class="min-w-0">
          <button
            v-if="a.room"
            type="button"
            class="text-left text-sm font-bold text-slate-900 hover:underline"
            @click="$emit('open-room', a.room)"
          >{{ a.title }}</button>
          <p v-else class="text-sm font-bold text-slate-900">{{ a.title }}</p>
          <p class="text-xs text-slate-600">{{ a.detail }}</p>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import { faBell, faCircleCheck, faCircleExclamation, faTriangleExclamation, faCircleInfo } from '@fortawesome/free-solid-svg-icons';

const props = defineProps({ alerts: { type: Array, default: () => [] } });
defineEmits(['open-room']);

const COLLAPSED = 6;
const expanded = ref(false);
const visible = computed(() => (expanded.value ? props.alerts : props.alerts.slice(0, COLLAPSED)));
const counts = computed(() => props.alerts.reduce((c, a) => { c[a.level] = (c[a.level] || 0) + 1; return c; }, {}));

const STYLE = {
  critical: { box: 'border-rose-200 bg-rose-50/70', fg: 'text-rose-500', icon: faCircleExclamation },
  warning: { box: 'border-amber-200 bg-amber-50/70', fg: 'text-amber-500', icon: faTriangleExclamation },
  info: { box: 'border-sky-200 bg-sky-50/70', fg: 'text-sky-500', icon: faCircleInfo },
};
</script>
