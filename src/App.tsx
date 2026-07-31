import { useCallback, useEffect, useRef, useState } from 'react';
import { BetControls } from './components/BetControls';
import { KenoGrid } from './components/KenoGrid';
import { MageCanvas } from './components/MageCanvas';
import { PayoutTable } from './components/PayoutTable';
import { StaffImpact } from './components/StaffImpact';
import { useKenoGame } from './hooks/useKenoGame';

export default function App() {
  const game = useKenoGame();
  const gridRef = useRef<HTMLDivElement>(null);
  const [impactPlaying, setImpactPlaying] = useState(false);
  const [impactComplete, setImpactComplete] = useState(false);

  // Reset impact pipeline for each new bet/draw
  useEffect(() => {
    setImpactPlaying(false);
    setImpactComplete(false);
  }, [game.activeDraw?.id]);

  const onStaffHit = useCallback(() => {
    setImpactComplete(false);
    setImpactPlaying(true);
  }, []);

  const onImpactEnded = useCallback(() => {
    setImpactPlaying(false);
    setImpactComplete(true);
  }, []);

  return (
    <div className={`app-shell ${game.flashHit ? 'is-flash' : ''}`}>
      <header className="top-bar">
        <div className="brand">
          <span className="brand-mark">✦</span>
          <h1>MAGE KENO</h1>
        </div>
        <p className="tagline">Pick up to 10 · 20 fireballs · Match to win</p>
      </header>

      <main className="stage">
        <section className="arena">
          <div className="arena-frame">
            <MageCanvas
              gridRef={gridRef}
              selected={game.selected}
              activeDraw={game.activeDraw}
              impactComplete={impactComplete}
              onStaffHit={onStaffHit}
              onFireballImpact={game.onFireballImpact}
              onSequenceComplete={game.onSequenceComplete}
            />
            <div className={`grid-panel${impactPlaying ? ' is-impact' : ''}`}>
              <div className="keno-grid-slot">
                <KenoGrid
                  gridRef={gridRef}
                  selected={game.selected}
                  ballState={game.ballState}
                  disabled={game.phase === 'playing'}
                  onToggle={game.toggleNumber}
                />
                <StaffImpact active={impactPlaying} onEnded={onImpactEnded} />
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

      {game.phase === 'result' && (
        <div className="result-modal" role="dialog" aria-modal="true">
          <div className="result-card">
            <h2>{game.lastWin > 0 ? 'SPELL HIT!' : 'NO MATCH'}</h2>
            <p>
              {game.lastMatches} match{game.lastMatches === 1 ? '' : 'es'} ·{' '}
              <span className="gold">{game.lastMultiplier.toFixed(1)}x</span>
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
