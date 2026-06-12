import { useStore, fmtLap } from '../store';

export function LapTimer() {
  const show = useStore((s) => s.ui.showLap);
  const toggle = useStore((s) => s.toggleLap);
  const lapNum = useStore((s) => s.telemetry.lapNum);
  const ready = useStore((s) => s.telemetry.lapReady);
  const running = useStore((s) => s.telemetry.lapRunning);
  const current = useStore((s) => Math.round(s.telemetry.lapCurrentSec * 1000) / 1000);
  const best = useStore((s) => s.telemetry.lapBestSec);
  const last = useStore((s) => s.telemetry.lapLastSec);
  const history = useStore((s) => s.telemetry.lapHistory);

  if (!show) {
    return <button id="lapShow" onClick={toggle} title="랩타임 열기 (L)">LAP TIMER ▾</button>;
  }

  let deltaTxt = '—';
  let deltaColor = '#fff';
  if (best !== null && running) {
    const d = current - best;
    deltaTxt = (d >= 0 ? '+' : '') + d.toFixed(2);
    deltaColor = d < 0 ? '#6f6' : '#f66';
  }

  return (
    <div id="lap-hud">
      <button id="lapClose" onClick={toggle} title="닫기 (L)" aria-label="Close lap timer">×</button>
      <div>
        <div className="label">LAP</div>
        <div className="value">{ready ? lapNum + 1 : '—'}</div>
      </div>
      <div>
        <div className="label">CURRENT</div>
        <div className="value big">{running ? fmtLap(current) : '—:——.———'}</div>
      </div>
      <div>
        <div className="label">BEST</div>
        <div className="value green">{fmtLap(best)}</div>
      </div>
      <div className="lap-row">
        <div><span className="label">LAST</span> <span className="white">{fmtLap(last)}</span></div>
        <div><span className="label">Δ</span> <span style={{ color: deltaColor }}>{deltaTxt}</span></div>
      </div>
      {history.length > 0 && (
        <div className="lap-history">
          {history.slice(-5).map((t, i, arr) => {
            const lapIdx = history.length - arr.length + i + 1;
            return (
              <div key={lapIdx} className={t === best ? 'green' : ''}>
                <span className="label">L{lapIdx}</span> {fmtLap(t)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
