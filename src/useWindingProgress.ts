import { useEffect, useState } from 'react';

/** Shared clock for the spring, crank and both partners' continuous meter. */
export function useWindingProgress(winding: number, windingAt?: number, windingDurationMs = 1400, windingPausedAt?: number) {
  const read = () => Math.min(1, Math.max(0, winding >= 4 ? 1 : windingAt
    ? ((windingPausedAt ?? Date.now()) - windingAt) / Math.max(1, windingDurationMs)
    : winding / 4));
  const [progress, setProgress] = useState(read);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const next = read();
      setProgress(next);
      if (windingAt && !windingPausedAt && next < 1) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [winding, windingAt, windingDurationMs, windingPausedAt]);
  return progress;
}
