<template>
  <Popover class="relative inline-flex">
    <PopoverButton
      ref="button"
      @click="place"
      class="inline-flex size-4 items-center justify-center rounded-full text-slate-300 transition-colors hover:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
      :aria-label="label"
    >
      <font-awesome-icon :icon="faCircleInfo" class="text-[11px]" />
    </PopoverButton>
    <transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <PopoverPanel
        :class="alignRight ? '-right-3' : '-left-3'"
        class="absolute top-6 z-30 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 text-xs font-medium normal-case leading-relaxed tracking-normal text-slate-600 shadow-lg"
      >
        <slot />
      </PopoverPanel>
    </transition>
  </Popover>
</template>

<script setup>
import { ref } from 'vue';
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/vue';
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons';

defineProps({ label: { type: String, default: 'More information' } });

// Open toward whichever side has room: rightward by default, leftward when a
// 16rem panel would run past the viewport edge.
const PANEL_PX = 256;
const button = ref(null);
const alignRight = ref(false);

function place() {
  const el = button.value?.$el || button.value;
  if (!el || !el.getBoundingClientRect) return;
  alignRight.value = el.getBoundingClientRect().left + PANEL_PX + 16 > window.innerWidth;
}
</script>
