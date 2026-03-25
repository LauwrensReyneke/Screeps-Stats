<template>
  <div ref="rootEl" class="inline-block">
    <button
      ref="triggerEl"
      type="button"
      class="flex size-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[9px] font-bold leading-none text-slate-500 transition-colors hover:border-indigo-300 hover:text-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
      :aria-label="ariaLabel"
      :aria-expanded="isOpen ? 'true' : 'false'"
      @click.stop="toggleOpen"
    >i</button>

    <Teleport to="body">
      <div v-if="isOpen" class="fixed inset-0 z-40" @click="closeTooltip"></div>
      <div
        v-if="isOpen"
        ref="panelEl"
        class="fixed z-50 max-w-xs rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-medium normal-case tracking-normal text-slate-600 shadow-lg"
        :style="panelStyle"
        role="tooltip"
      >
        <slot />
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  ariaLabel: {
    type: String,
    default: 'More information',
  },
});

const rootEl = ref(null);
const triggerEl = ref(null);
const panelEl = ref(null);
const isOpen = ref(false);
const panelStyle = ref({ top: '0px', left: '0px' });

function closeTooltip() {
  isOpen.value = false;
}

function toggleOpen() {
  isOpen.value = !isOpen.value;
}

function handleKeydown(event) {
  if (event.key === 'Escape' && isOpen.value) {
    event.stopPropagation();
    closeTooltip();
    return;
  }

  if (event.key === 'Tab' && isOpen.value) closeTooltip();
}

function calculatePosition() {
  if (!triggerEl.value || !panelEl.value) return;

  const gap = 8;
  const edge = 8;
  const trigger = triggerEl.value.getBoundingClientRect();
  const panel = panelEl.value.getBoundingClientRect();

  let left = trigger.left + (trigger.width / 2) - (panel.width / 2);
  left = Math.max(edge, Math.min(left, window.innerWidth - panel.width - edge));

  let top = trigger.bottom + gap;
  const fitsBelow = top + panel.height <= window.innerHeight - edge;
  if (!fitsBelow) {
    const above = trigger.top - panel.height - gap;
    top = above >= edge ? above : Math.max(edge, window.innerHeight - panel.height - edge);
  }

  panelStyle.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
  };
}

function onViewportChange() {
  if (!isOpen.value) return;
  calculatePosition();
}

watch(isOpen, async (open) => {
  if (open) {
    await nextTick();
    calculatePosition();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
  } else {
    window.removeEventListener('resize', onViewportChange);
    window.removeEventListener('scroll', onViewportChange, true);
  }
});

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('resize', onViewportChange);
  window.removeEventListener('scroll', onViewportChange, true);
});
</script>
