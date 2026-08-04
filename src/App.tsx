import { useCallback, useEffect, useRef, useState } from 'react';
import { BetControls } from './components/BetControls';
import { FairnessFooter } from './components/FairnessFooter';
import { KenoGrid } from './components/KenoGrid';
import { MageCanvas } from './components/MageCanvas';
import { PayoutTable } from './components/PayoutTable';
import { StaffImpact } from './components/StaffImpact';
import { useKenoGame } from './hooks/useKenoGame';
import { isEmbedded } from './utils/bridge';

export default function App() {
  const game = useKenoGame();
  const gridRef = useRef<HTMLDivElement>(null);
  const [impactPlaying, setImpactPlaying] = useState(false);
  const embedded = isEmbedded();

  // Reset storm for each new bet/draw
  useEffect(() => {
    setImpactPlaying(false);
  }, [game.activeDraw?.id]);

  const onStaffHit = useCallback(() => {
    setImpactPlaying(true);
  }, []);

  const onSequenceComplete = useCallback(() => {
    setImpactPlaying(false);
    game.onSequenceComplete();
  }, [game.onSequenceComplete]);

  return (
    <div
      className={`app-shell${game.flashHit ? ' is-flash' : ''}${embedded ? ' is-embedded' : ''}`}
    >
      <header className="top-bar">
        <div className="brand">
          <span className="brand-mark">✦</span>
          <h1>MAGE KENO</h1>
        </div>
        <p className="tagline">
          Pick up to 10 goblins · 20 fireballs · Match hits to stun them and win
        </p>
      </header>

      <main className="stage">
        <section className="arena">
          <div
            className={`arena-frame${impactPlaying ? ' has-storm' : ''}`}
          >
            <img
              className="arena-sky arena-sky-mobile"
              src="./assets/mage-bg.png"
              alt=""
              draggable={false}
              aria-hidden="true"
            />
            <img
              className="arena-sky arena-sky-desktop"
              src="./assets/mage-bg-desktop.png"
              alt=""
              draggable={false}
              aria-hidden="true"
            />
            <StaffImpact active={impactPlaying} />
            <MageCanvas
              gridRef={gridRef}
              selected={game.selected}
              activeDraw={game.activeDraw}
              onStaffHit={onStaffHit}
              onFireballImpact={game.onFireballImpact}
              onSequenceComplete={onSequenceComplete}
            />
            <div className="grid-panel">
              <div className="keno-grid-slot">
                <KenoGrid
                  gridRef={gridRef}
                  selected={game.selected}
                  ballState={game.ballState}
                  animatingNumber={game.animatingNumber}
                  disabled={game.phase === 'playing'}
                  onToggle={game.toggleNumber}
                />
              </div>
            </div>
          </div>
          <PayoutTable spots={game.selected.size} />
        </section>
      </main>

      <BetControls
        balance={game.balance}
        bet={game.bet}
        selectedCount={game.selected.size}
        canBet={game.canBet}
        playing={game.phase === 'playing'}
        onBetChange={game.setBet}
        onRandom={game.randomSelect}
        onClear={game.clearSelection}
        onBet={game.startBet}
      />

      <FairnessFooter
        spots={game.selected.size}
        fairness={game.fairness}
        shortHash={game.shortHash}
      />

      {game.phase === 'result' && (
        <div className="result-modal" role="dialog" aria-modal="true">
          <div className="result-card">
            <h2>{game.lastWin > 0 ? 'SPELL HIT!' : 'NO MATCH'}</h2>
            <p>
              {game.lastMatches} match{game.lastMatches === 1 ? '' : 'es'} ·{' '}
              <span className="gold">{game.lastMultiplier.toFixed(1)}×</span>
            </p>
            <p className="result-win">
              {game.lastWin > 0 ? `+$${game.lastWin.toLocaleString()}` : 'Better luck next cast'}
            </p>
            <button type="button" className="btn-bet" onClick={game.dismissResult}>
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
