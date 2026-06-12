// 하단 중앙 메인 클러스터 — SVG 원형 RPM 게이지 + 시프트 LED 아크 + 속도/기어

import { useStore } from '../store';
import { useDim } from './useDim';

const CX = 110, CY = 112;
const GAUGE_R = 84;
const LED_R = 101;
const START_DEG = -130, SWEEP = 260;

function polar(r: number, deg: number): [number, number] {
  const a = (deg - 90) * Math.PI / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function arcPath(r: number, fromDeg: number, toDeg: number): string {
  const [sx, sy] = polar(r, fromDeg);
  const [ex, ey] = polar(r, toDeg);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
}

const LED_ANGLES = Array.from({ length: 12 }, (_, i) => -66 + i * 12);
const LED_COLORS = ['#3ec88a', '#3ec88a', '#3ec88a', '#3ec88a', '#e8b53e', '#e8b53e', '#e8b53e', '#e8b53e', '#e83e3e', '#e83e3e', '#e83e3e', '#e83e3e'];

export function Cluster() {
  const speed = useStore((s) => Math.round(s.telemetry.speedKmh));
  const gear = useStore((s) => s.telemetry.gearLabel);
  const rpm = useStore((s) => s.telemetry.rpm);
  const rpmFrac = useStore((s) => Math.round(s.telemetry.rpmFrac * 200) / 200);
  const shiftLight = useStore((s) => s.telemetry.shiftLight);
  const revCut = useStore((s) => s.telemetry.revCut);
  const ledsOn = useStore((s) => s.telemetry.ledsOn);
  const throttle = useStore((s) => s.telemetry.throttle);
  const brake = useStore((s) => s.telemetry.brake);
  const redlineFrac = useStore((s) => s.telemetry.redlineFrac);
  const dim = useDim(0.33, 0.67, 0.6, 1);

  const fillEnd = START_DEG + SWEEP * Math.max(0.004, rpmFrac);
  const fillColor = rpmFrac >= redlineFrac ? '#e83e3e' : rpmFrac > 0.8 ? '#e8b53e' : '#3ec88a';
  const redlineDeg = START_DEG + SWEEP * redlineFrac;
  const [r1x, r1y] = polar(GAUGE_R - 9, redlineDeg);
  const [r2x, r2y] = polar(GAUGE_R + 9, redlineDeg);

  return (
    <div id="cluster-pod" className={dim ? 'dimmed' : ''}>
      <svg viewBox="0 0 220 210" width="250" height="238">
        {/* 게이지 배경 트랙 */}
        <path d={arcPath(GAUGE_R, START_DEG, START_DEG + SWEEP)} fill="none"
          stroke="rgba(255,255,255,0.08)" strokeWidth="13" strokeLinecap="round" />
        {/* RPM 필 */}
        <path d={arcPath(GAUGE_R, START_DEG, fillEnd)} fill="none"
          stroke={fillColor} strokeWidth="13" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${fillColor})`, transition: 'stroke 0.15s' }} />
        {/* 레드라인 틱 */}
        <line x1={r1x} y1={r1y} x2={r2x} y2={r2y} stroke="#e83e3e" strokeWidth="3" />
        {/* 시프트 LED 아크 */}
        {LED_ANGLES.map((deg, i) => {
          const [x, y] = polar(LED_R, deg);
          const on = i < ledsOn;
          return (
            <circle key={i} cx={x} cy={y} r="4.4"
              fill={on ? LED_COLORS[i] : 'rgba(255,255,255,0.08)'}
              className={on && revCut ? 'led-blink' : ''}
              style={on ? { filter: `drop-shadow(0 0 4px ${LED_COLORS[i]})` } : undefined} />
          );
        })}
        {/* 시프트 라이트 */}
        <circle cx={CX} cy={CY - GAUGE_R + 26} r="6"
          fill={shiftLight ? '#e83e3e' : 'rgba(255,255,255,0.07)'}
          className={shiftLight ? 'led-blink' : ''}
          style={shiftLight ? { filter: 'drop-shadow(0 0 8px #e83e3e)' } : undefined} />

        {/* 속도 */}
        <text x={CX} y={CY - 2} textAnchor="middle" className="cl-speed">{speed}</text>
        <text x={CX} y={CY + 16} textAnchor="middle" className="cl-unit">km/h</text>
        {/* 기어 / RPM */}
        <text x={CX} y={CY + 47} textAnchor="middle" className="cl-gear" key={gear}>{gear}</text>
        <text x={CX} y={CY + 64} textAnchor="middle" className="cl-rpm">{rpm} rpm</text>

        {/* 페달 인디케이터 (좌 브레이크 / 우 스로틀) */}
        <rect x="14" y={CY + 30 - 56 * brake} width="7" height={56 * brake} rx="3" fill="#ff5046" opacity="0.9" />
        <rect x="14" y={CY - 26} width="7" height="56" rx="3" fill="none" stroke="rgba(255,255,255,0.12)" />
        <rect x="199" y={CY + 30 - 56 * throttle} width="7" height={56 * throttle} rx="3" fill="#50e68c" opacity="0.9" />
        <rect x="199" y={CY - 26} width="7" height="56" rx="3" fill="none" stroke="rgba(255,255,255,0.12)" />
      </svg>
    </div>
  );
}
