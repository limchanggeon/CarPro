import { useState } from 'react';
import { useStore } from '../store';
import { getTrack } from '../engine/tracks';
import { useDim } from './useDim';

// 트랙 surface에서 생성한 미니맵 이미지 + % 좌표 차량 마커
export function Minimap() {
  const x = useStore((s) => Math.round(s.telemetry.posX));
  const y = useStore((s) => Math.round(s.telemetry.posY));
  const yawDeg = useStore((s) => Math.round(s.telemetry.yawDeg / 3) * 3);
  const trackId = useStore((s) => s.ui.selectedTrackId);
  const minimapUrl = useStore((s) => s.ui.minimapUrl);
  const dim = useDim(0.74, 1, 0.62, 1);
  const [aspect, setAspect] = useState(1);   // 미니맵 이미지 H/W

  const def = getTrack(trackId);
  if (!minimapUrl) return null;

  // surface가 덮는 월드 영역: 폭 worldWidthMeters, 높이 worldWidthMeters×aspect
  const px = ((x - def.originX) / def.worldWidthMeters) * 100;
  const py = ((y - def.originY) / (def.worldWidthMeters * aspect)) * 100;

  return (
    <div id="minimap" className={dim ? 'dimmed' : ''}>
      <div id="minimap-label">{def.name}</div>
      <div id="minimap-wrap">
        <img
          src={minimapUrl}
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
