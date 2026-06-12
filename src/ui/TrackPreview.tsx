// 로비 트랙 미리보기 — 스플라인 트랙은 SVG 폴리라인, 인제는 map.png

import { TrackDef, sampleClosedSpline } from '../engine/tracks';

export function TrackPreview({ def }: { def: TrackDef }) {
  if (def.kind === 'image') {
    return (
      <img
        className="track-preview"
        src={`${import.meta.env.BASE_URL}${def.image}`}
        alt={def.name}
        style={{ filter: 'invert(1) brightness(0.9)' }}
      />
    );
  }
  const pts = sampleClosedSpline(def.points!, 8)
    .map(([x, y]) => `${(x / def.worldWidthMeters * 100).toFixed(1)},${(y / def.worldWidthMeters * 100).toFixed(1)}`)
    .join(' ');
  return (
    <svg viewBox="0 0 100 100" className="track-preview">
      <polygon points={pts} fill="none" stroke="rgba(232,236,242,0.9)" strokeWidth="4.5"
        strokeLinejoin="round" />
      <polygon points={pts} fill="none" stroke="rgba(232,62,62,0.55)" strokeWidth="1.2"
        strokeLinejoin="round" strokeDasharray="3 4" />
    </svg>
  );
}
