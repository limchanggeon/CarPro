// 로비 차량 미리보기 — 탑뷰 SVG (렌더러와 동일한 실루엣 언어)

import type { CarSpec } from '../engine/cars';

export function CarPreview({ spec }: { spec: CarSpec }) {
  const v = spec.visual;
  // viewBox: 길이 방향 가로 120, 차종 비율 유지
  const L = 100;
  const W = (v.wid / v.len) * 100;
  const cy = 30;
  const gid = `g-${spec.id}`;

  if (v.kind === 'f1') {
    const bw = W * 0.4;
    return (
      <svg viewBox="0 0 120 60" className="car-preview">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={v.colorTop} />
            <stop offset="100%" stopColor={v.colorBottom} />
          </linearGradient>
        </defs>
        {/* 휠 */}
        {[[24, -1], [24, 1], [96, -1], [96, 1]].map(([x, side], i) => (
          <rect key={i} x={120 - x - 9} y={cy + (side as number) * W * 0.5 - 4.5} width="18" height="9" rx="3" fill="#0c0d10" />
        ))}
        {/* 윙 */}
        <rect x={104} y={cy - W / 2} width="6" height={W} rx="2" fill={v.color} />
        <rect x={10} y={cy - W * 0.38} width="7" height={W * 0.76} rx="2" fill={v.color} />
        {/* 모노코크 */}
        <polygon
          points={`110,${cy - W * 0.05} 110,${cy + W * 0.05} 67,${cy + bw / 2} 14,${cy + bw / 2} 14,${cy - bw / 2} 67,${cy - bw / 2}`}
          fill={`url(#${gid})`} stroke="rgba(0,0,0,0.5)"
        />
        <rect x={50} y={cy - bw * 0.35} width="14" height={bw * 0.7} rx="3" fill="#10141c" />
        <circle cx={56} cy={cy} r={bw * 0.42} fill="none" stroke="rgba(200,205,215,0.8)" strokeWidth="1.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 120 60" className="car-preview">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={v.colorTop} />
          <stop offset="50%" stopColor={v.color} />
          <stop offset="100%" stopColor={v.colorBottom} />
        </linearGradient>
      </defs>
      {[[26, -1], [26, 1], [92, -1], [92, 1]].map(([x, side], i) => (
        <rect key={i} x={120 - x - 8} y={cy + (side as number) * W * 0.5 - 3} width="16" height="6" rx="2" fill="#0c0d10" />
      ))}
      <rect x={10} y={cy - W / 2} width={L} height={W} rx="7" fill={`url(#${gid})`} stroke="rgba(0,0,0,0.45)" />
      <rect x={10 + L * 0.3} y={cy - W * 0.36} width={L * 0.42} height={W * 0.72} rx="5" fill="#181c24" />
      <rect x={10 + L * 0.76} y={cy - W * 0.3} width={L * 0.2} height={W * 0.6} rx="3" fill="rgba(255,255,255,0.1)" />
    </svg>
  );
}
