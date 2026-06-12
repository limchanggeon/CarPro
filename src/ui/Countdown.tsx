// 레이스 스타트 카운트다운 — 3 · 2 · 1 · GO!

import { useStore } from '../store';

export function Countdown() {
  const t = useStore((s) => s.telemetry.countdown);
  const trackReady = useStore((s) => s.ui.trackReady);
  if (!trackReady || t <= -0.8) return null;

  const label = t > 0 ? String(Math.ceil(t)) : 'GO!';
  return (
    <div id="countdown" className={t <= 0 ? 'go' : ''} key={label}>
      {label}
    </div>
  );
}
