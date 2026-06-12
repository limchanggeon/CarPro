// 트랙 정의 — 이미지(인제) + 스플라인(자체 설계 서킷)

export interface StartLineDef {
  x1: number; y1: number; x2: number; y2: number;   // 라인 양 끝 (m)
  nx: number; ny: number;                            // 정상 진행 방향 노멀
}

export interface TrackDef {
  id: string;
  name: string;
  desc: string;
  lengthLabel: string;
  difficulty: 1 | 2 | 3;
  kind: 'image' | 'spline';
  image?: string;                 // kind=image
  points?: Array<[number, number]>;  // kind=spline — 닫힌 루프 컨트롤 포인트 (m)
  halfWidthM?: number;
  worldWidthMeters: number;       // 마스크가 덮는 월드 폭
  originX: number; originY: number;
  start: { x: number; y: number; yaw: number };
  startLine: StartLineDef;
}

export const TRACKS: TrackDef[] = [
  {
    id: 'inje',
    name: '인제 스피디움',
    desc: '실존 서킷 — 고저차 없는 평면 버전. 테크니컬 인필드 + 긴 직선',
    lengthLabel: '3.9 km',
    difficulty: 3,
    kind: 'image',
    image: 'map.png',
    worldWidthMeters: 1500,
    originX: 50, originY: 50,
    start: { x: 1022, y: 891, yaw: -Math.PI / 2 },
    startLine: { x1: 992, y1: 879, x2: 1052, y2: 879, nx: 0, ny: -1 },
  },
  {
    id: 'carpro-gp',
    name: 'CarPro GP',
    desc: '자체 설계 그랑프리 서킷 — 헤어핀, 시케인, 고속 에세스의 종합 선물세트',
    lengthLabel: '약 4.2 km',
    difficulty: 2,
    kind: 'spline',
    halfWidthM: 11,
    worldWidthMeters: 1500,
    originX: 0, originY: 0,
    points: [
      [300, 1200], [900, 1200],            // 메인 직선 (동→)
      [1150, 1150], [1250, 1000],          // T1-T2 고속 우
      [1150, 850], [1000, 800],            // T3 헤어핀 진입
      [1050, 650], [1250, 550],            // T4 좌-우 콤비
      [1300, 400], [1150, 280],            // T5 고속 좌
      [900, 300], [750, 400],              // T6 에세스
      [650, 300], [450, 250],              // T7 시케인
      [300, 350], [250, 550],              // T8 장반경 좌
      [350, 700], [450, 800],              // T9 우
      [350, 950], [250, 1100],             // T10 마지막 복합
    ],
    start: { x: 650, y: 1200, yaw: 0 },
    startLine: { x1: 700, y1: 1170, x2: 700, y2: 1230, nx: 1, ny: 0 },
  },
  {
    id: 'oval',
    name: '스피드 오벌',
    desc: '풀 스로틀 슈퍼스피드웨이 — 최고속 대결, F1과 EV의 놀이터',
    lengthLabel: '약 3.1 km',
    difficulty: 1,
    kind: 'spline',
    halfWidthM: 15,
    worldWidthMeters: 1500,
    originX: 0, originY: 0,
    points: [
      [400, 450], [1100, 450],
      [1290, 620], [1290, 880],
      [1100, 1050], [400, 1050],
      [210, 880], [210, 620],
    ],
    start: { x: 700, y: 1050, yaw: 0 },
    startLine: { x1: 750, y1: 1020, x2: 750, y2: 1080, nx: 1, ny: 0 },
  },
];

export function getTrack(id: string): TrackDef {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}

// 닫힌 Catmull-Rom 스플라인 샘플링 — 트랙 래스터화와 로비 미리보기 공용
export function sampleClosedSpline(points: Array<[number, number]>, perSeg = 12): Array<[number, number]> {
  const n = points.length;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let j = 0; j < perSeg; j++) {
      const t = j / perSeg;
      const t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}
