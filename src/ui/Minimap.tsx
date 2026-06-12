import { useStore } from '../store';
import { TRACK_META } from '../engine/constants';

const MM_WIDTH = 210;   // px

export function Minimap() {
  const x = useStore((s) => Math.round(s.telemetry.posX * 10) / 10);
  const y = useStore((s) => Math.round(s.telemetry.posY * 10) / 10);
  const yawDeg = useStore((s) => Math.round(s.telemetry.yawDeg));

  const scale = MM_WIDTH / TRACK_META.imgWidthMeters;
  const mmX = (x - TRACK_META.originXm) * scale;
  const mmY = (y - TRACK_META.originYm) * scale;

  return (
    <div id="minimap">
      <div id="minimap-label">INJE SPEEDIUM</div>
      <img src={`${import.meta.env.BASE_URL}map.png`} alt="track map" />
      <div
        id="minimap-car"
        style={{ left: mmX, top: mmY, transform: `translate(-50%,-50%) rotate(${yawDeg + 90}deg)` }}
      />
    </div>
  );
}
