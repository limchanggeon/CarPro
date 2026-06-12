// 로비 — 차량/트랙 선택 + 레이스 시작

import { CARS, getCar } from '../engine/cars';
import { TRACKS, getTrack } from '../engine/tracks';
import { useStore } from '../store';
import { CarPreview } from './CarPreview';
import { TrackPreview } from './TrackPreview';

export function Lobby() {
  const carId = useStore((s) => s.ui.selectedCarId);
  const trackId = useStore((s) => s.ui.selectedTrackId);
  const selectCar = useStore((s) => s.selectCar);
  const selectTrack = useStore((s) => s.selectTrack);
  const startRace = useStore((s) => s.startRace);

  const car = getCar(carId);
  const track = getTrack(trackId);

  return (
    <div id="lobby">
      <header id="lobby-head">
        <h1>CAR<span>PRO</span></h1>
        <p>FULL PHYSICS RACING SIMULATOR</p>
      </header>

      <div id="lobby-body">
        <section className="lb-section">
          <h2>차량 선택</h2>
          <div className="car-grid">
            {CARS.map((c) => (
              <button
                key={c.id}
                className={`car-card${c.id === carId ? ' sel' : ''}`}
                onClick={() => selectCar(c.id)}
              >
                <CarPreview spec={c} />
                <div className="cc-name">{c.name}</div>
                <div className="cc-brand">{c.brand}</div>
                <div className="cc-badges">
                  <span className="badge">{c.stats.drive}</span>
                  {c.ev && <span className="badge ev">EV</span>}
                  <span className="badge dim">{c.stats.power}</span>
                </div>
              </button>
            ))}
          </div>
          <div className="lb-detail">
            <b>{car.brand} {car.name}</b> — {car.desc}
            <div className="lb-stats">
              <span>출력 <b>{car.stats.power}</b></span>
              <span>토크 <b>{car.stats.torque}</b></span>
              <span>중량 <b>{car.stats.weight}</b></span>
              <span>구동 <b>{car.stats.drive}</b></span>
            </div>
          </div>
        </section>

        <section className="lb-section">
          <h2>트랙 선택</h2>
          <div className="track-grid">
            {TRACKS.map((t) => (
              <button
                key={t.id}
                className={`track-card${t.id === trackId ? ' sel' : ''}`}
                onClick={() => selectTrack(t.id)}
              >
                <TrackPreview def={t} />
                <div className="tc-name">{t.name}</div>
                <div className="tc-meta">
                  <span>{t.lengthLabel}</span>
                  <span className="tc-diff">
                    {Array.from({ length: 3 }, (_, i) => (
                      <i key={i} className={i < t.difficulty ? 'on' : ''} />
                    ))}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div className="lb-detail">{track.desc}</div>
        </section>
      </div>

      <footer id="lobby-foot">
        <div className="lf-sel">
          <span>{car.name}</span> · <span>{track.name}</span>
        </div>
        <button id="start-race" onClick={startRace}>RACE START ▸</button>
        <div className="lf-hint">W/A/S/D 주행 · [ ] 기어 · ESC 로비 복귀 · 🎮 게임패드 지원</div>
      </footer>
    </div>
  );
}
