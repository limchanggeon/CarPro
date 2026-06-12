import { useStore } from '../store';

const LED_COLORS = ['g', 'g', 'g', 'g', 'a', 'a', 'a', 'a', 'r', 'r', 'r', 'r'];

export function SpeedGear() {
  const speed = useStore((s) => Math.round(s.telemetry.speedKmh));
  const gear = useStore((s) => s.telemetry.gearLabel);
  const rpm = useStore((s) => s.telemetry.rpm);
  const rpmFrac = useStore((s) => Math.round(s.telemetry.rpmFrac * 200) / 200);
  const shiftLight = useStore((s) => s.telemetry.shiftLight);
  const revCut = useStore((s) => s.telemetry.revCut);
  const ledsOn = useStore((s) => s.telemetry.ledsOn);

  return (
    <>
      <div id="cluster">
        <div className="block">
          <div className="label">SPEED</div>
          <div><span className="value">{speed}</span><span className="unit"> km/h</span></div>
        </div>
        <div className="block">
          <div className="label">GEAR</div>
          <div className="gear" key={gear}>{gear}</div>
        </div>
        <div className="block rpm">
          <div className="label">RPM <span className="rpm-text">{rpm}</span></div>
          <div className="tach-track">
            <div className="fill" style={{ width: `${Math.min(100, rpmFrac * 100)}%` }} />
            <div className="redline" />
          </div>
          <div id="shift-light" className={shiftLight ? 'on' : ''} />
        </div>
      </div>
      <div id="rev-strip" className={revCut ? 'limiter' : ''}>
        {LED_COLORS.map((c, i) => (
          <span key={i} className={`led ${c}${i < ledsOn ? ' on' : ''}`} />
        ))}
      </div>
    </>
  );
}
