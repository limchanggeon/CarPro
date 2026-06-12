// 우측 슬라이드인 설정 드로어 (기존 하단 대시보드 대체)

import { useStore } from '../store';
import { getSimulation } from '../engine/simulation';

export function SettingsDrawer() {
  const open = useStore((s) => s.ui.showSettings);
  const toggle = useStore((s) => s.toggleSettings);
  const settings = useStore((s) => s.settings);
  const setSetting = useStore((s) => s.setSetting);
  const sim = getSimulation();

  return (
    <>
      <div id="edge-buttons">
        <button onClick={toggle} title="셋업" className={open ? 'on' : ''}>⚙</button>
        <button onClick={() => useStore.getState().toggleHelp()} title="도움말 (H)">?</button>
      </div>
      <div id="settings-drawer" className={open ? 'open' : ''}>
        <h3>SETUP</h3>
        <label>
          <div className="sd-row"><span>Tire μ</span><b>{settings.mu.toFixed(2)}</b></div>
          <input type="range" min={0.6} max={1.6} step={0.05} value={settings.mu}
            onChange={(e) => setSetting('mu', parseFloat(e.target.value))} />
        </label>
        <label>
          <div className="sd-row"><span>Steer Max</span><b>{settings.maxSteer.toFixed(2)} rad</b></div>
          <input type="range" min={0.35} max={0.7} step={0.01} value={settings.maxSteer}
            onChange={(e) => setSetting('maxSteer', parseFloat(e.target.value))} />
        </label>
        <label>
          <div className="sd-row"><span>Volume</span><b>{Math.round(settings.volume * 100)}%</b></div>
          <input type="range" min={0} max={1} step={0.05} value={settings.volume}
            onChange={(e) => setSetting('volume', parseFloat(e.target.value))} />
        </label>
        <div className="sd-actions">
          <button onClick={sim.reset}>RESET (R)</button>
          <button onClick={sim.clearSkids}>CLEAR SKID (C)</button>
        </div>
        <div className="sd-note">GR86 SIM v4 · Inje Speedium</div>
      </div>
    </>
  );
}
