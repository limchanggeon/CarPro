import { useStore } from '../store';
import { SpeedGear } from './SpeedGear';
import { GMeter } from './GMeter';
import { Minimap } from './Minimap';
import { LapTimer } from './LapTimer';
import { SimPanel } from './SimPanel';
import { TelemetryGraph } from './TelemetryGraph';

export function Hud() {
  const showHelp = useStore((s) => s.ui.showHelp);
  const statusLabel = useStore((s) => s.telemetry.statusLabel);
  const statusCls = useStore((s) => s.telemetry.statusCls);
  const alphaF = useStore((s) => s.telemetry.alphaF.toFixed(2));
  const alphaR = useStore((s) => s.telemetry.alphaR.toFixed(2));
  const kappaR = useStore((s) => s.telemetry.kappaR.toFixed(2));
  const trackReady = useStore((s) => s.ui.trackReady);

  return (
    <div id="hud">
      <SpeedGear />
      <div id="slip-info">
        αF <span>{alphaF}</span>  αR <span>{alphaR}</span>  κR <span>{kappaR}</span>
      </div>
      <div id="status-label" className={statusCls}>{statusLabel}</div>
      <LapTimer />
      <GMeter />
      <Minimap />
      <SimPanel />
      <TelemetryGraph />
      {!trackReady && <div id="loading">LOADING TRACK…</div>}
      {showHelp && (
        <div id="help-overlay">
          <b>GR86 SIM v4</b><br />
          <kbd>W</kbd>가속 <kbd>S</kbd>브레이크<br />
          <kbd>A</kbd>/<kbd>D</kbd>조향 <kbd>Space</kbd>핸드<br />
          <kbd>[</kbd>/<kbd>]</kbd>기어 <kbd>C</kbd>스키드<br />
          <kbd>1</kbd>ABS <kbd>2</kbd>TC <kbd>3</kbd>ESC<br />
          <kbd>4</kbd>TC레벨 <kbd>L</kbd>랩HUD <kbd>R</kbd>리셋 <kbd>H</kbd>도움말<br />
          <span className="pad">🎮 게임패드 지원 (스틱 조향 / 트리거 가감속 / 숄더 시프트)</span>
        </div>
      )}
    </div>
  );
}
