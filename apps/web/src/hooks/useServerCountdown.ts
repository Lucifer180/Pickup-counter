import { useEffect, useRef, useState } from 'react';

/**
 * Countdown that does not trust the device clock.
 *
 * Date.now() on the counter may be minutes wrong, so we never compare against
 * an absolute expiresAt. Instead the server tells us "N seconds left" and we
 * anchor that to performance.now(), a monotonic clock that only measures
 * elapsed time. Each new server reading re-anchors the deadline, so even a
 * paused or throttled tab self-corrects on the next poll.
 */
export function useServerCountdown(expiresInSeconds: number | undefined, sentAt: number | undefined): number {
  const deadline = useRef<number | null>(null);
  const [msLeft, setMsLeft] = useState<number>(() => (expiresInSeconds ?? 0) * 1000);

  useEffect(() => {
    if (expiresInSeconds === undefined || sentAt === undefined) return;
    const next = sentAt + expiresInSeconds * 1000;
    // Server values are whole seconds; ignore sub-second wobble so the display doesn't jitter.
    if (deadline.current === null || Math.abs(next - deadline.current) > 1500) deadline.current = next;
  }, [expiresInSeconds, sentAt]);

  useEffect(() => {
    const tick = () => {
      if (deadline.current !== null) setMsLeft(Math.max(0, deadline.current - performance.now()));
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, []);

  return msLeft;
}
