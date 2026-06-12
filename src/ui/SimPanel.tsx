import { useStore } from '../store';
import { getSimulation } from '../engine/simulation';
import { SPEC } from '../engine/constants';

function tempClass(t: number): string {
  if (t < 70) return 'cold';
  if (t <= 105) return 'ok';
  if (t <= 125) return 'warm';
  return 'hot';
}

function brakeClass(t: number): string {
  if (t < 100) return 'cold';
  if (t < 250) return 'ok';
  if (t < SPEC.brakeFadeStart) return 'warm';
  return 'hot';
}

function tempBarPos(t: number): number {
  return Math.max(0, Math.min(100, (t - 20) / 1.5));
}

function AidChip(props: { id: 'abs' | 'tc' | 'esc'; on: boolean; active: boolean; children: React.ReactNode }) {
  const cls = props.on ? (props.active ? 'aid active' : 'aid on') : 'aid';
  return (
    <button className={cls} onClick={() => getSimulation().toggleAid(props.id)}>
      {props.children}
    </button>
  );
}

export function SimPanel() {
  const t = useStore((s) => s.telemetry);
  const tF = Math.round(t.tireTempF), tR = Math.round(t.tireTempR);
  const wF = Math.round(t.tireWearF * 100), wR = Math.round(t.tireWearR * 100);
  const bF = Math.round(t.brakeTempF), bR = Math.round(t.brakeTempR);

  return (
    <div id="sim-panel">
      <div className="section">
        <h4>AIDS</h4>
        <div className="row">
          <AidChip id="abs" on={t.absOn} active={t.absActive}>ABS</AidChip>
          <AidChip id="tc" on={t.tcOn} active={t.tcActive}>
            TC <span onClick={(e) => { e.stopPropagation(); getSimulation().cycleTcLevel(); }}>{t.tcLevel}</span>
          </AidChip>
          <AidChip id="esc" on={t.escOn} active={t.escActive}>ESC</AidChip>
        </div>
      </div>
      <div className="section">
        <h4>TIRES (TEMP / WEAR)</h4>
        <div className="row"><span>F</span><span className={`temp ${tempClass(tF)}`}>{tF}°C</span><span>{wF}%</span></div>
        <div className="tbar"><span style={{ width: `${tempBarPos(tF)}%` }} /></div>
        <div className="tbar wear"><span style={{ width: `${Math.min(100, wF)}%` }} /></div>
        <div className="row mt"><span>R</span><span className={`temp ${tempClass(tR)}`}>{tR}°C</span><span>{wR}%</span></div>
        <div className="tbar"><span style={{ width: `${tempBarPos(tR)}%` }} /></div>
        <div className="tbar wear"><span style={{ width: `${Math.min(100, wR)}%` }} /></div>
      </div>
      <div className="section">
        <h4>BRAKES</h4>
        <div className="row"><span>F</span><span className={`temp ${brakeClass(bF)}`}>{bF}°C</span></div>
        <div className="row"><span>R</span><span className={`temp ${brakeClass(bR)}`}>{bR}°C</span></div>
      </div>
    </div>
  );
}
