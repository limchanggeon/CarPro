import { useStore } from '../store';
import { getSimulation } from '../engine/simulation';

export function Dashboard() {
  const settings = useStore((s) => s.settings);
  const setSetting = useStore((s) => s.setSetting);
  const sim = getSimulation();

  return (
    <div id="dashboard">
      <label>
        Tire μ <span className="val">{settings.mu.toFixed(2)}</span>
        <input
          type="range" min={0.6} max={1.6} step={0.05} value={settings.mu}
          onChange={(e) => setSetting('mu', parseFloat(e.target.value))}
        />
      </label>
      <label>
        Steer Max <span className="val">{settings.maxSteer.toFixed(2)}</span>
        <input
          type="range" min={0.35} max={0.7} step={0.01} value={settings.maxSteer}
          onChange={(e) => setSetting('maxSteer', parseFloat(e.target.value))}
        />
      </label>
      <label>
        Volume <span className="val">{Math.round(settings.volume * 100)}%</span>
        <input
          type="range" min={0} max={1} step={0.05} value={settings.volume}
          onChange={(e) => setSetting('volume', parseFloat(e.target.value))}
        />
      </label>
      <button onClick={sim.reset}>RESET</button>
      <button onClick={sim.clearSkids}>CLEAR SKID</button>
    </div>
  );
}
