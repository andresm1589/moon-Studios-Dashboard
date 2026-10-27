import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useSettings } from '@/contexts/SettingsContext';
import { motionPreference } from '@/lib/motionPreference';
import './workspace-motion.css';

// Explicit surfaces, rather than every div: long mail lists and editing fields
// must stay responsive. The observer only inspects added subtrees in this view.
const REVEAL_SELECTOR = [
  '[data-moon-reveal]', '.dh-hero', '.dh-stat', '.dh-banner', '.dh-panel',
  '.dh-momentum', '.dh-services', '.dh-task-item', '.dh-project-item',
  '.dh-announcement', '.dh-activity-list > li', '.dh-project-detail',
  '.moon-module > header', '.moon-module-heading',
  '.moon-panel', '.moon-stat', '.moon-project-card', '.moon-project-row',
  '.tr-stat', '.tr-card', '.tr-fila', '.cal-card', '.cal-grid-wrap',
  '.cal-panel', '.cal-task-btn', '.cal-list-row', '.ann-card', '.ann-empty',
  '.correo-mail-item', '.ceo-card-lift', '.ceo-stat-glow', '.ceo-employee-row',
  '.wb-panel', '.wb-tarjeta', '.wb-kpi', '.wb-fila',
  '.mc-group', '.mc-collection', '.mc-entry', '.s-fadeIn', '.aj-card',
  '.moon-module tbody > tr', '.moon-module [role="tabpanel"]',
].join(',');
const EASE = 'cubic-bezier(.22, 1, .36, 1)';

function MotionSurface({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled || !('IntersectionObserver' in window)) return;

    let seen = new WeakSet<Element>();
    const pending = new Set<HTMLElement>();
    const running = new Set<Animation>();
    const additions = new Set<HTMLElement>();
    const art = new Set<HTMLElement>();

    const reveal = (element: HTMLElement, order: number) => {
      if (!element.isConnected) { pending.delete(element); visibility.unobserve(element); return; }
      // Keep a pending surface observed until it can actually be shown. A
      // background load or a CSS entrance must not consume its only reveal.
      if (document.hidden) return;
      const opacity = getComputedStyle(element).opacity;
      if (element.getClientRects().length === 0 || Number(opacity) === 0) return;
      pending.delete(element);
      visibility.unobserve(element);
      element.dataset.moonRevealed = 'true';
      const row = element.dataset.moonReveal === 'row' || element.matches('tr, .tr-fila, .wb-fila, .dh-task-item, .dh-project-item, .dh-announcement, .correo-mail-item, .ceo-employee-row, li');
      const animation = element.animate([
        { opacity: 0, translate: row ? '6px 0' : '0 12px' },
        { opacity, translate: '0 0' },
      ], { duration: row ? 220 : 340, delay: Math.min(order, 4) * 25, easing: EASE, fill: 'backwards' });
      running.add(animation);
      const finished = () => running.delete(animation);
      animation.addEventListener('finish', finished, { once: true });
      animation.addEventListener('cancel', finished, { once: true });
    };

    const visibility = new IntersectionObserver(entries => {
      let order = 0;
      for (const entry of entries) {
        if (entry.isIntersecting) reveal(entry.target as HTMLElement, order++);
      }
    }, { threshold: 0.04 });

    // The two decorative orbits run only while the illustration is on screen.
    const artVisibility = new IntersectionObserver(entries => {
      for (const entry of entries) (entry.target as HTMLElement).dataset.moonMotionVisible = String(entry.isIntersecting);
    });

    const inspect = (subtree: HTMLElement) => {
      if (!root.contains(subtree)) return;
      const clip = root.closest('.main-scroll')?.getBoundingClientRect();
      const top = Math.max(0, clip?.top ?? 0), bottom = Math.min(window.innerHeight, clip?.bottom ?? window.innerHeight);
      const left = Math.max(0, clip?.left ?? 0), right = Math.min(window.innerWidth, clip?.right ?? window.innerWidth);
      let order = 0;
      const candidates = subtree.matches(REVEAL_SELECTOR) ? [subtree] : [];
      candidates.push(...subtree.querySelectorAll<HTMLElement>(REVEAL_SELECTOR));
      for (const element of candidates) {
        if (seen.has(element) || element.closest('[data-moon-motion="off"]')) continue;
        // A card and its rows must not travel together twice. The outermost
        // surface owns the entrance; its nested content remains immediately usable.
        const owner = element.parentElement?.closest(REVEAL_SELECTOR);
        if (owner && root.contains(owner)) { seen.add(element); continue; }
        // No opacity is written to the DOM. Even a detached observer or a
        // background tab can never leave actual content invisible.
        if (pending.size < 240) {
          seen.add(element); pending.add(element); visibility.observe(element);
          const rect = element.getBoundingClientRect();
          // Start visible cards before paint. Waiting for the first IO callback
          // briefly painted them at opacity 1 and then restarted them at 0.
          if (!document.hidden && rect.bottom > top && rect.top < bottom && rect.right > left && rect.left < right) reveal(element, order++);
        }
      }
      const illustrations = subtree.matches('.dh-hero-art, .el-orbit-art') ? [subtree] : [];
      illustrations.push(...subtree.querySelectorAll<HTMLElement>('.dh-hero-art, .el-orbit-art'));
      for (const element of illustrations) {
        if (!art.has(element)) { art.add(element); artVisibility.observe(element); }
      }
    };

    const flush = () => {
      const roots = new Set(additions);
      additions.clear();
      for (const subtree of roots) {
        // Walk ancestors instead of comparing every added sibling with all
        // others: a large table insertion stays proportional to DOM depth.
        let covered = false;
        for (let parent = subtree.parentElement; parent; parent = parent.parentElement) {
          if (roots.has(parent)) { covered = true; break; }
          if (parent === root) break;
        }
        if (!covered) inspect(subtree);
      }
    };

    const queue = (subtree: HTMLElement) => {
      additions.add(subtree);
    };

    const changes = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') {
          const panel = record.target as HTMLElement;
          if (panel.matches('[role="tabpanel"]') && !panel.hidden && panel.dataset.state !== 'inactive') {
            seen.delete(panel);
            queue(panel);
          }
          continue;
        }
        for (const node of record.addedNodes) if (node instanceof HTMLElement) queue(node);
        // Removed, unseen content should not occupy observation slots forever
        // during pagination or filtering of large operational lists.
        if (record.removedNodes.length) {
          for (const element of pending) if (!root.contains(element)) { visibility.unobserve(element); pending.delete(element); }
          for (const element of art) if (!root.contains(element)) { artVisibility.unobserve(element); art.delete(element); }
        }
      }
      // MutationObserver already batches a commit before paint. A second RAF
      // would expose lazy-loaded panels for one frame before their entrance.
      flush();
    });
    changes.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'data-state'] });
    inspect(root);

    const resume = () => {
      if (document.hidden) return;
      inspect(root);
      // Reobserving schedules a fresh intersection record even when a surface
      // remained on screen while this tab was hidden or its CSS was fading in.
      for (const element of pending) { visibility.unobserve(element); visibility.observe(element); }
    };
    const visibilityChanged = () => {
      if (!document.hidden) { resume(); return; }
      // Complete short entrance effects rather than resuming an old entrance
      // halfway through when the person returns to the application.
      for (const animation of running) animation.finish();
    };
    const replay = () => {
      if (document.hidden) return;
      for (const animation of running) animation.cancel();
      visibility.disconnect(); pending.clear(); seen = new WeakSet<Element>();
      inspect(root);
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    root.addEventListener('animationend', resume, true);
    window.addEventListener('moon:replay-motion', replay);
    return () => {
      changes.disconnect(); visibility.disconnect(); artVisibility.disconnect();
      document.removeEventListener('visibilitychange', visibilityChanged);
      root.removeEventListener('animationend', resume, true);
      window.removeEventListener('moon:replay-motion', replay);
      for (const animation of running) animation.cancel();
      for (const element of art) delete element.dataset.moonMotionVisible;
      additions.clear(); pending.clear(); art.clear();
      running.clear();
    };
  }, [enabled]);

  return <div ref={rootRef} className="moon-motion-surface">{children}</div>;
}

/** Replace the route immediately; individual surfaces own a single entrance. */
export function WorkspaceMotion({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const { settings } = useSettings();
  const reducedMotion = useReducedMotion();
  const [pageHidden, setPageHidden] = useState(() => document.hidden);
  const { enabled } = motionPreference(settings, reducedMotion);

  useEffect(() => {
    const changed = () => setPageHidden(document.hidden);
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);

  useEffect(() => {
    // Portalled dialogs need the same setting; this attribute changes only on
    // visibility/preferences changes, never during scrolling or animation.
    const previous = document.body.getAttribute('data-moon-workspace-motion');
    document.body.dataset.moonWorkspaceMotion = !enabled ? 'off' : pageHidden ? 'paused' : 'on';
    return () => {
      if (previous === null) document.body.removeAttribute('data-moon-workspace-motion');
      else document.body.setAttribute('data-moon-workspace-motion', previous);
    };
  }, [enabled, pageHidden]);

  return <div className="moon-workspace-motion" data-moon-motion={enabled ? 'full' : 'off'} data-moon-motion-paused={pageHidden}>
      <div key={routeKey} className="moon-motion-view" data-moon-route={routeKey}>
        <MotionSurface enabled={enabled}>{children}</MotionSurface>
      </div>
  </div>;
}
