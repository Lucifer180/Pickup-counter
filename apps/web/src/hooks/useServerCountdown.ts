import { useEffect, useRef, useState } from 'react';

export function useServerCountdown(expiresInSeconds: number | undefined, sentAt: number | undefined): number {
  const deadline = useRef<number | null>(null);
  const [msLeft, setMsLeft] = useState<number>(() => (expiresInSeconds ?? 0) * 1000);

  useEffect(() => {
    if (expiresInSeconds === undefined || sentAt === undefined) return;
    const next = sentAt + expiresInSeconds * 1000;

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
