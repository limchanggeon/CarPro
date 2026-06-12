import { useStore } from '../store';
import { Cluster } from './Cluster';
import { TimingWidget } from './TimingWidget';
import { SystemsPod } from './SystemsPod';
import { TelemetryPod } from './TelemetryPod';
import { Minimap } from './Minimap';
import { SettingsDrawer } from './SettingsDrawer';
import { HelpModal } from './HelpModal';
import { Countdown } from './Countdown';

export function Hud() {
  const statusLabel = useStore((s) => s.telemetry.statusLabel);
  const statusCls = useStore((s) => s.telemetry.statusCls);
  const trackReady = useStore((s) => s.ui.trackReady);

  return (
    <div id="hud">
      <TimingWidget />
      <div id="status-pill" className={statusCls}>{statusLabel}</div>
      <SystemsPod />
      <TelemetryPod />
      <Cluster />
      <Minimap />
      <SettingsDrawer />
      <Countdown />
      {!trackReady && <div id="loading">LOADING TRACK…</div>}
      <HelpModal />
    </div>
  );
}
