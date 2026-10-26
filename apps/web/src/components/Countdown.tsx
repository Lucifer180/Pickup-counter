interface Props {
  msLeft: number;
  totalMs: number;
}

export function Countdown({ msLeft, totalMs }: Props) {
  const seconds = Math.ceil(msLeft / 1000);
  const mm = String(Math.floor(seconds / 60)).padStart(1, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const pct = Math.max(0, Math.min(100, (msLeft / totalMs) * 100));
  const urgent = seconds <= 20;
  return (
    <div className={`countdown ${urgent ? 'urgent' : ''}`} role="timer" aria-live="off">
      <div className="time">
        {mm}:{ss}
      </div>
      <div className="bar">
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="muted small">{seconds > 0 ? 'left to pay before your items are released' : 'Time is up, checking…'}</div>
    </div>
  );
}
