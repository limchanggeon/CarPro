import { useStore } from '../store';

export function GMeter() {
  const gx = useStore((s) => s.telemetry.gDispX);
  const gy = useStore((s) => s.telemetry.gDispY);
  const tx = useStore((s) => s.telemetry.gTrailX);
  const ty = useStore((s) => s.telemetry.gTrailY);
  const gMag = useStore((s) => s.telemetry.gMag.toFixed(2));

  return (
    <div id="g-meter">
      <div className="g-cross-h" />
      <div className="g-cross-v" />
      <div className="g-title">G-FORCE</div>
      <div className="g-trail" style={{ transform: `translate(${tx}px, ${ty}px)` }} />
      <div id="g-dot" style={{ transform: `translate(${gx}px, ${gy}px)` }} />
      <div className="g-readout">{gMag} G</div>
    </div>
  );
}
