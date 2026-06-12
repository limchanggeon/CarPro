import { useState } from 'react';
import { useStore } from '../store';
import { TRACK_META } from '../engine/constants';
import { useDim } from './useDim';

// 차량 마커를 이미지 래퍼 기준 % 좌표로 배치 — 패널 크기/패딩과 무관하게 정확
export function Minimap() {
  const x = useStore((s) => Math.round(s.telemetry.posX));
  const y = useStore((s) => Math.round(s.telemetry.posY));
  const yawDeg = useStore((s) => Math.round(s.telemetry.yawDeg / 3) * 3);
  const dim = useDim(0.74, 1, 0.62, 1);
  const [aspect, setAspect] = useState(1.23);   // H/W — 이미지 로드 시 실측값으로 교체

  const heightMeters = TRACK_META.imgWidthMeters * aspect;
  const px = ((x - TRACK_META.originXm) / TRACK_META.imgWidthMeters) * 100;
  const py = ((y - TRACK_META.originYm) / heightMeters) * 100;

  return (
    <div id="minimap" className={dim ? 'dimmed' : ''}>
      <div id="minimap-label">INJE SPEEDIUM</div>
      <div id="minimap-wrap">
        <img
          src={`${import.meta.env.BASE_URL}map.png`}
          alt="track map"
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth) setAspect(img.naturalHeight / img.naturalWidth);
          }}
        />
        <div
          id="minimap-car"
          style={{
            left: `${px}%`,
            top: `${py}%`,
            transform: `translate(-50%,-50%) rotate(${yawDeg + 90}deg)`,
          }}
        />
      </div>
    </div>
  );
}
