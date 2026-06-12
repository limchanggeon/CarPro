// 우상단 차량 상태 포드 — 차량 도식(축별 타이어 컬러) + 마모/브레이크 + 보조장치 칩

import { useStore } from '../store';
import { getSimulation } from '../engine/simulation';
import { SPEC } from '../engine/constants';
import { useDim } from './useDim';

function tireColor(t: number): string {
  if (t < 70) return '#6ea8ff';
  if (t <= 105) return '#3ec88a';
  if (t <= 125) return '#e8b53e';
  return '#e83e3e';
}

function brakeColor(t: number): string {
  if (t < 100) return '#6ea8ff';
  if (t < 250) return '#3ec88a';
  if (t < SPEC.brakeFadeStart) return '#e8b53e';
  return '#e83e3e';
}

function AidChip(props: { id: 'abs' | 'tc' | 'esc'; on: boolean; active: boolean; label: string }) {
  const cls = props.on ? (props.active ? 'aid active' : 'aid on') : 'aid';
  return (
    <button className={cls} onClick={() => getSimulation().toggleAid(props.id)}>
      {props.label}
    </button>
  );
}

export function SystemsPod() {
  const t = useStore((s) => s.telemetry);
  const dim = useDim(0.8, 1, 0, 0.38);
  const tF = Math.round(t.tireTempF), tR = Math.round(t.tireTempR);
  const wF = Math.round(t.tireWearF * 100), wR = Math.round(t.tireWearR * 100);
  const bF = Math.round(t.brakeTempF), bR = Math.round(t.brakeTempR);
  const cF = tireColor(tF), cR = tireColor(tR);

  return (
    <div id="systems" className={dim ? 'dimmed' : ''}>
      <div className="sys-aids">
        <AidChip id="abs" on={t.absOn} active={t.absActive} label="ABS" />
        <AidChip id="tc" on={t.tcOn} active={t.tcActive} label={`TC·${t.tcLevel}`} />
        <AidChip id="esc" on={t.escOn} active={t.escActive} label="ESC" />
      </div>
      <div className="sys-body">
        {/* 차량 탑뷰 도식 — 휠 색 = 축별 타이어 온도 */}
        <svg viewBox="0 0 60 100" width="54" height="90">
          <rect x="14" y="8" width="32" height="84" rx="12" fill="rgba(255,255,255,0.06)"
            stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
          <rect x="20" y="30" width="20" height="28" rx="5" fill="rgba(255,255,255,0.1)" />
          <rect x="6" y="14" width="9" height="18" rx="3" fill={cF} style={{ filter: `drop-shadow(0 0 4px ${cF})` }} />
          <rect x="45" y="14" width="9" height="18" rx="3" fill={cF} style={{ filter: `drop-shadow(0 0 4px ${cF})` }} />
          <rect x="6" y="68" width="9" height="18" rx="3" fill={cR} style={{ filter: `drop-shadow(0 0 4px ${cR})` }} />
          <rect x="45" y="68" width="9" height="18" rx="3" fill={cR} style={{ filter: `drop-shadow(0 0 4px ${cR})` }} />
          {/* 브레이크 디스크 점 */}
          <circle cx="10.5" cy="23" r="2.4" fill={brakeColor(bF)} />
          <circle cx="49.5" cy="23" r="2.4" fill={brakeColor(bF)} />
          <circle cx="10.5" cy="77" r="2.4" fill={brakeColor(bR)} />
          <circle cx="49.5" cy="77" r="2.4" fill={brakeColor(bR)} />
        </svg>
        <div className="sys-stats">
          <div className="sys-axle">
            <span className="ax">F</span>
            <b style={{ color: cF }}>{tF}°</b>
            <span className="wear">{wF}%</span>
            <b style={{ color: brakeColor(bF) }}>{bF}°</b>
          </div>
          <div className="sys-cols"><span>TIRE</span><span>WEAR</span><span>BRK</span></div>
          <div className="sys-axle">
            <span className="ax">R</span>
            <b style={{ color: cR }}>{tR}°</b>
            <span className="wear">{wR}%</span>
            <b style={{ color: brakeColor(bR) }}>{bR}°</b>
          </div>
        </div>
      </div>
    </div>
  );
}
