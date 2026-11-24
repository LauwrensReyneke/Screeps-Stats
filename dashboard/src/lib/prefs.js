import { ref, watch } from 'vue';

// UI preferences that survive a reload. One localStorage key, one value each.
const KEY = 'screeps-stats.prefs.v2';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

const store = load();

export function usePref(name, fallback) {
  const r = ref(store[name] ?? fallback);
  watch(r, (v) => {
    store[name] = v;
    localStorage.setItem(KEY, JSON.stringify(store));
  });
  return r;
}
