// 레이싱 라인 + 브레이킹 포인트 계산
// 1) 센터라인 확보 (스플라인 샘플 또는 마스크 추적)
// 2) 곡률 기반 에이펙스 컷 오프셋
// 3) 차종별 속도 프로파일 (코너 한계 → 후진 제동 패스 → 전진 가속 패스)
// 4) 구간 컬러(풀스로틀/한계유지/브레이킹) + 브레이킹 마커

import { CarSpec, engineTorque } from './cars';
import { Track } from './track';
import { sampleClosedSpline } from './tracks';

export type LineZone = 0 | 1 | 2;   // 0=풀스로틀, 1=코너 한계 유지, 2=브레이킹

export interface RacingLinePoint {
  x: number; y: number;
  zone: LineZone;
  v: number;            // 목표 속도 (m/s)
}

export interface BrakeMarker {
  x: number; y: number;
  tx: number; ty: number;   // 진행 방향 단위벡터
}

export interface RacingLine {
  points: RacingLinePoint[];
  markers: BrakeMarker[];
}

const DS = 6;             // 리샘플 간격 (m)
const V_CAP = 130;        // 속도 상한 (m/s)

export function computeRacingLine(track: Track, spec: CarSpec): RacingLine | null {
  const def = track.def;
  if (!def) return null;

  // ── 1. 센터라인 + 폭 ──
  let raw: Array<[number, number]>;
  let maxOff: number;
  if (def.kind === 'spline') {
    raw = sampleClosedSpline(def.points!, 14);
    maxOff = Math.max(2, (def.halfWidthM ?? 10) - 4.5);
  } else if (def.linePoints) {
    // 사전 추출된 센터라인 (맵 마스크 스켈레톤)
    raw = def.linePoints;
    maxOff = Math.max(2, (def.halfWidthM ?? 8) - 4);
  } else {
    const traced = traceCenterline(track);
    if (!traced) return null;
    raw = traced.pts;
    maxOff = Math.max(2, traced.minClearance - 4);
  }

  const center = resampleClosed(raw, DS);
  const n = center.length;
  if (n < 24) return null;

  // ── 2. 곡률 → 에이펙스 컷 오프셋 ──
  const kappaC = curvatures(center);
  smoothInPlace(kappaC, 4);
  const offs = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    offs[i] = Math.max(-1, Math.min(1, kappaC[i] * 220)) * maxOff;
  }
  smoothInPlace(offs, 8);

  const line: Array<[number, number]> = new Array(n);
  for (let i = 0; i < n; i++) {
    const p0 = center[(i - 1 + n) % n], p2 = center[(i + 1) % n];
    let tx = p2[0] - p0[0], ty = p2[1] - p0[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    // 좌법선(-ty,tx): κ>0(좌회전) 시 코너 안쪽
    line[i] = [center[i][0] - ty * offs[i], center[i][1] + tx * offs[i]];
  }

  // ── 3. 속도 프로파일 ──
  const kappa = curvatures(line);
  smoothInPlace(kappa, 3);

  const mu = spec.gripMult * 0.95;
  const downC = Math.max(0, spec.aeroLiftCoef) / spec.mass;   // 다운포스 가속 항 (v² 계수)
  const peakPower = spec.torque.reduce((p, [rpm, nm]) => Math.max(p, nm * rpm * Math.PI / 30), 0)
                  * spec.drivelineEff;

  const vlim = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.abs(kappa[i]);
    const denom = k - mu * downC;
    vlim[i] = denom > 1e-6 ? Math.min(V_CAP, Math.sqrt(mu * 9.81 / denom)) : V_CAP;
  }

  const aBrk = (v: number) => mu * (9.81 + downC * v * v) * 0.95;
  const aAcc = (v: number) => Math.min(mu * (9.81 + downC * v * v) * 0.7, peakPower / (spec.mass * Math.max(v, 5)));

  const v = Float64Array.from(vlim);
  // 후진 패스 (제동 한계) — 닫힌 루프라 2바퀴
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const next = v[(i + 1) % n];
      v[i] = Math.min(v[i], Math.sqrt(next * next + 2 * aBrk(next) * DS));
    }
  }
  // 전진 패스 (가속 한계)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const prev = v[(i - 1 + n) % n];
      v[i] = Math.min(v[i], Math.sqrt(prev * prev + 2 * aAcc(prev) * DS));
    }
  }

  // ── 4. 구간 분류 ──
  const zones = new Uint8Array(n);
  const aBrkRef = mu * 9.81;
  for (let i = 0; i < n; i++) {
    const vn = v[(i + 1) % n];
    const decel = (v[i] * v[i] - vn * vn) / (2 * DS);
    if (decel > aBrkRef * 0.3) zones[i] = 2;
    else if (vlim[i] < V_CAP * 0.98 && v[i] > vlim[i] * 0.93) zones[i] = 1;
    else zones[i] = 0;
  }
  // 짧은 런 정리 (깜빡임 제거)
  cleanZones(zones, 3);

  const points: RacingLinePoint[] = new Array(n);
  for (let i = 0; i < n; i++) {
    points[i] = { x: line[i][0], y: line[i][1], zone: zones[i] as LineZone, v: v[i] };
  }

  // 브레이킹 마커: 비제동 → 제동 전환점
  const markers: BrakeMarker[] = [];
  for (let i = 0; i < n; i++) {
    const prev = zones[(i - 1 + n) % n];
    if (zones[i] === 2 && prev !== 2) {
      const p0 = line[(i - 1 + n) % n], p2 = line[(i + 1) % n];
      let tx = p2[0] - p0[0], ty = p2[1] - p0[1];
      const tl = Math.hypot(tx, ty) || 1;
      markers.push({ x: line[i][0], y: line[i][1], tx: tx / tl, ty: ty / tl });
    }
  }

  return { points, markers };
}

// ── 마스크 센터라인 추적기 (이미지 트랙용) ──
// 시작점에서 진행 방향으로 한 스텝씩, 좌우 여유가 가장 균형 잡힌 방향을 선택
function traceCenterline(track: Track): { pts: Array<[number, number]>; minClearance: number } | null {
  const start = track.startPos;
  if (!start) return null;
  const isOn = (x: number, y: number) => track.isOnTrack(x, y);

  const clearance = (x: number, y: number, dir: number): number => {
    const cd = Math.cos(dir), sd = Math.sin(dir);
    for (let d = 1; d <= 20; d++) {
      if (!isOn(x + cd * d, y + sd * d)) return d;
    }
    return 20;
  };

  // 탐색 레벨: 평상시 전진 → 막히면 전방위로 점프 반경 확대 (헤어핀 끝점 탈출)
  const LEVELS: Array<[number, number]> = [
    [7, 0.6], [4, 1.0],
    [2.5, Math.PI], [5, Math.PI], [9, Math.PI], [14, Math.PI],
  ];
  let px = start.x, py = start.y, h = start.yaw;
  const pts: Array<[number, number]> = [];
  let minClearance = 20;
  let travelled = 0;

  // 방문 셀 (8m 그리드) — 전방위 탐색에서 왔던 길 차단
  const visited = new Set<string>();
  const cellOf = (x: number, y: number) => `${Math.round(x / 5)},${Math.round(y / 5)}`;
  visited.add(cellOf(px, py));

  for (let s = 0; s < 4000; s++) {
    let bestScore = -Infinity, bestH = h, bestX = 0, bestY = 0, bestCl = 0, bestStep = 7;
    for (const [step, maxDh] of LEVELS) {
      for (let dh = -maxDh; dh <= maxDh + 1e-4; dh += 0.06) {
        const hh = h + dh;
        const nx = px + Math.cos(hh) * step;
        const ny = py + Math.sin(hh) * step;
        if (!isOn(nx, ny)) continue;
        // 급선회 후보만 방문 셀 차단 (왔던 길 U턴 방지) — 전진은 자유
        if (Math.abs(dh) > 0.9) {
          const homing = travelled > 300 && Math.hypot(nx - start.x, ny - start.y) < 50;
          if (!homing && visited.has(cellOf(nx, ny))) continue;
        }
        const cl = Math.min(clearance(nx, ny, hh + Math.PI / 2), clearance(nx, ny, hh - Math.PI / 2));
        const score = cl - Math.abs(dh) * 7;   // 직진 선호 — 피트레인 분기 무시
        if (score > bestScore) {
          bestScore = score; bestH = hh; bestX = nx; bestY = ny; bestCl = cl; bestStep = step;
        }
      }
      if (bestScore > -Infinity) break;        // 이 레벨에서 길 찾음
    }
    if (bestScore === -Infinity) {
      console.log(`[racingline] trace dead-end at step ${s}, pos (${px.toFixed(0)},${py.toFixed(0)})`);
      return null;
    }
    px = bestX; py = bestY; h = bestH;
    travelled += bestStep;
    pts.push([px, py]);
    visited.add(cellOf(px, py));
    minClearance = Math.min(minClearance, bestCl);
    if (travelled > 300 && Math.hypot(px - start.x, py - start.y) < 12) {
      return { pts, minClearance };             // 루프 폐합
    }
  }
  console.log(`[racingline] trace did not close, last (${px.toFixed(0)},${py.toFixed(0)}), dist ${Math.hypot(px - start.x, py - start.y).toFixed(0)}m`);
  return null;
}

// ── 유틸 ──

function resampleClosed(pts: Array<[number, number]>, ds: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let acc = 0;
  let prev = pts[0];
  out.push([prev[0], prev[1]]);
  for (let i = 1; i <= pts.length; i++) {
    const cur = pts[i % pts.length];
    let segLen = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    let from = prev;
    while (acc + segLen >= ds) {
      const need = ds - acc;
      const t = need / segLen;
      const nx = from[0] + (cur[0] - from[0]) * t;
      const ny = from[1] + (cur[1] - from[1]) * t;
      out.push([nx, ny]);
      from = [nx, ny];
      segLen -= need;
      acc = 0;
    }
    acc += segLen;
    prev = cur;
  }
  return out;
}

// 3점 외접원 곡률 (부호: 좌회전 +)
function curvatures(pts: Array<[number, number]>): Float64Array {
  const n = pts.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 2 + n) % n], b = pts[i], c = pts[(i + 2) % n];
    const abx = b[0] - a[0], aby = b[1] - a[1];
    const bcx = c[0] - b[0], bcy = c[1] - b[1];
    const cross = abx * bcy - aby * bcx;
    const la = Math.hypot(abx, aby), lb = Math.hypot(bcx, bcy);
    const lc = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const denom = la * lb * lc;
    out[i] = denom > 1e-6 ? (2 * cross) / denom : 0;
  }
  return out;
}

function smoothInPlace(arr: Float64Array, win: number): void {
  const n = arr.length;
  const src = Float64Array.from(arr);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = -win; j <= win; j++) sum += src[(i + j + n) % n];
    arr[i] = sum / (2 * win + 1);
  }
}

// 길이 < minRun 인 zone 런을 이웃에 흡수
function cleanZones(zones: Uint8Array, minRun: number): void {
  const n = zones.length;
  let i = 0;
  while (i < n) {
    const z = zones[i];
    let j = i;
    while (j < n && zones[j] === z) j++;
    if (j - i < minRun) {
      const repl = zones[(i - 1 + n) % n];
      for (let k = i; k < j; k++) zones[k] = repl;
    }
    i = j;
  }
}
