// 좌상단 F1 브로드캐스트 스타일 타이밍 위젯

import { useStore, fmtLap } from '../store';
import { useDim } from './useDim';

export function TimingWidget() {
  const show = useStore((s) => s.ui.showLap);
  const toggle = useStore((s) => s.toggleLap);
  const lapNum = useStore((s) => s.telemetry.lapNum);
  const ready = useStore((s) => s.telemetry.lapReady);
  const running = useStore((s) => s.telemetry.lapRunning);
  const current = useStore((s) => Math.round(s.telemetry.lapCurrentSec * 100) / 100);
  const best = useStore((s) => s.telemetry.lapBestSec);
  const last = useStore((s) => s.telemetry.lapLastSec);
  const history = useStore((s) => s.telemetry.lapHistory);
  const dim = useDim(0, 0.18, 0, 0.42);

  if (!show) {
    return <button id="lapShow" onClick={toggle} title="랩타임 열기 (L)">⏱ TIMING</button>;
  }

  let delta: { txt: string; cls: string } | null = null;
  if (best !== null && running) {
    const d = current - best;
    delta = { txt: (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(2), cls: d < 0 ? 'neg' : 'pos' };
  }

  return (
    <div id="timing" className={dim ? 'dimmed' : ''}>
      <div className="t-head">
        <span className="t-lap">LAP {ready ? lapNum + 1 : '—'}</span>
        <button className="t-close" onClick={toggle} title="닫기 (L)">×</button>
      </div>
      <div className="t-current">{running ? fmtLap(current) : '—:——.——'}</div>
      {delta && <div className={`t-delta ${delta.cls}`}>{delta.txt}</div>}
      <div className="t-rows">
        <div className="t-row"><span>BEST</span><b className="green">{fmtLap(best)}</b></div>
        <div className="t-row"><span>LAST</span><b>{fmtLap(last)}</b></div>
      </div>
      {history.length > 0 && (
        <div className="t-history">
          {history.slice(-5).map((t, i, arr) => {
            const lapIdx = history.length - arr.length + i + 1;
            return (
              <div key={lapIdx} className={`t-row${t === best ? ' best' : ''}`}>
                <span>L{lapIdx}</span><b>{fmtLap(t)}</b>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
