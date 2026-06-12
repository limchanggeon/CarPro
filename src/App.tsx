import { useEffect, useRef } from 'react';
import { getSimulation } from './engine/simulation';
import { useStore } from './store';
import { Hud } from './ui/Hud';
import { Lobby } from './ui/Lobby';

function RaceView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const speedFx = useStore((s) => Math.round(s.telemetry.speedFx * 100) / 100);
  const carId = useStore((s) => s.ui.selectedCarId);
  const trackId = useStore((s) => s.ui.selectedTrackId);

  useEffect(() => {
    const sim = getSimulation();
    if (canvasRef.current) sim.attach(canvasRef.current);
    void sim.configure(carId, trackId);
    sim.start();
    return () => sim.stop();
  }, [carId, trackId]);

  return (
    <div id="viewport">
      <canvas ref={canvasRef} id="worldCanvas" />
      <div id="vignette" style={{ opacity: 0.25 + speedFx * 0.45 }} />
      <Hud />
    </div>
  );
}

export default function App() {
  const screen = useStore((s) => s.ui.screen);
  return screen === 'lobby' ? <Lobby /> : <RaceView />;
}
