// 좌하단 통합 텔레메트리 포드 — 트레이스 그래프 + G-미터 + 슬립 수치

import { useStore } from '../store';
import { TelemetryGraph } from './TelemetryGraph';

export function TelemetryPod() {
  const gx = useStore((s) => s.telemetry.gDispX);
  const gy = useStore((s) => s.telemetry.gDispY);
  const tx = useStore((s) => s.telemetry.gTrailX);
  const ty = useStore((s) => s.telemetry.gTrailY);
  const gMag = useStore((s) => s.telemetry.gMag.toFixed(2));
  const alphaF = useStore((s) => s.telemetry.alphaF.toFixed(2));
  const alphaR = useStore((s) => s.telemetry.alphaR.toFixed(2));
  const kappaR = useStore((s) => s.telemetry.kappaR.toFixed(2));

  // G-미터 반경 56px 내로 표시 (스토어 값은 38px/G 스케일)
  const k = 56 / 58;

  return (
    <div id="telemetry-pod">
      <div className="tp-graph">
        <div className="tg-legend">
          <span className="spd">SPD</span>
          <span className="thr">THR</span>
          <span className="brk">BRK</span>
        </div>
        <TelemetryGraph />
        <div className="tp-slip">
          αF <b>{alphaF}</b>  αR <b>{alphaR}</b>  κR <b>{kappaR}</b>
        </div>
      </div>
      <div className="tp-g">
        <div className="g-ring r2" />
        <div className="g-ring r1" />
        <div className="g-cross-h" />
        <div className="g-cross-v" />
        <div className="g-trail" style={{ transform: `translate(${tx * k}px, ${ty * k}px)` }} />
        <div className="g-dot" style={{ transform: `translate(${gx * k}px, ${gy * k}px)` }} />
        <div className="g-readout">{gMag}<span>G</span></div>
      </div>
    </div>
  );
}
