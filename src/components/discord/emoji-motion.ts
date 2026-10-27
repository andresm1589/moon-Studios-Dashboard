import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let stop: (() => void) | undefined;
function snapshot() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || !!document.querySelector('body[data-moon-workspace-motion="off"], [data-moon-motion="off"], [data-motion="off"]');
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!stop && typeof window !== 'undefined') {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const notify = () => listeners.forEach(next => next());
    media.addEventListener('change', notify);
    const observer = new MutationObserver(notify);
    observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-moon-workspace-motion', 'data-moon-motion', 'data-motion'] });
    stop = () => { media.removeEventListener('change', notify); observer.disconnect(); stop = undefined; };
  }
  return () => { listeners.delete(listener); if (!listeners.size) stop?.(); };
}
export const useEmojiReducedMotion = () => useSyncExternalStore(subscribe, snapshot, () => true);
