import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

/** Keep depth motion outside physical SVG transforms and interactive hit targets. */
export function DepthLayer({ name, depth, children }: { name: string; depth: number; children: ReactNode }) {
  return <g data-depth-layer={name} data-depth={depth} style={{ '--layer-depth': depth } as CSSProperties}>{children}</g>;
}

/** A short, demand-driven animation loop; no React renders or layout reads per frame. */
export function useObjectDepth(view: 'box' | 'mechanism' | 'winding') {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scene = ref.current;
    if (!scene) return;
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let enabled = false, engaged = false, outside = true, frame = 0, resetTimer = 0;
    let x = 0, y = 0, targetX = 0, targetY = 0;
    let bounds = scene.getBoundingClientRect();
    const paint = () => {
      scene.style.setProperty('--scene-x', `${x.toFixed(3)}px`);
      scene.style.setProperty('--scene-y', `${y.toFixed(3)}px`);
      scene.style.setProperty('--tilt-x', `${(-y * .28).toFixed(3)}deg`);
      scene.style.setProperty('--tilt-y', `${(x * .32).toFixed(3)}deg`);
    };
    const tick = () => {
      frame = 0;
      if (engaged) return;
      x += (targetX - x) * .18;
      y += (targetY - y) * .18;
      if (Math.abs(targetX - x) + Math.abs(targetY - y) < .02) { x = targetX; y = targetY; }
      paint();
      if (x !== targetX || y !== targetY) frame = requestAnimationFrame(tick);
    };
    const animate = () => { if (!frame && !engaged) frame = requestAnimationFrame(tick); };
    const configure = () => {
      enabled = view !== 'winding' && fine.matches && !reduced.matches;
      scene.dataset.parallax = enabled ? 'on' : 'off';
      if (!enabled) { cancelAnimationFrame(frame); frame = 0; x = y = targetX = targetY = 0; paint(); }
    };
    const enter = (event: PointerEvent) => {
      outside = false; bounds = scene.getBoundingClientRect();
      if (event.buttons !== 0) down();
    };
    const move = (event: PointerEvent) => {
      if (event.buttons !== 0) { down(); return; }
      if (!enabled || engaged || event.pointerType !== 'mouse') return;
      const amount = view === 'mechanism' ? 2 : 5;
      targetX = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width) * 2 - 1)) * amount;
      targetY = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height) * 2 - 1)) * amount * .65;
      animate();
    };
    const leave = () => { outside = true; targetX = targetY = 0; if (!engaged) animate(); };
    const down = () => {
      if (!enabled) return;
      engaged = true; cancelAnimationFrame(frame); frame = 0;
      scene.dataset.parallax = 'engaged';
    };
    const release = () => {
      if (!engaged) return;
      engaged = false; scene.dataset.parallax = enabled ? 'on' : 'off';
      // Leave the pose still through click dispatch, including a cancelled drag.
      if (outside) resetTimer = window.setTimeout(() => { targetX = targetY = 0; animate(); }, 0);
    };
    configure();
    fine.addEventListener('change', configure); reduced.addEventListener('change', configure);
    scene.addEventListener('pointerenter', enter); scene.addEventListener('pointermove', move);
    scene.addEventListener('pointerleave', leave); scene.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release);
    return () => {
      cancelAnimationFrame(frame); clearTimeout(resetTimer);
      fine.removeEventListener('change', configure); reduced.removeEventListener('change', configure);
      scene.removeEventListener('pointerenter', enter); scene.removeEventListener('pointermove', move);
      scene.removeEventListener('pointerleave', leave); scene.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release);
    };
  }, [view]);
  return ref;
}
