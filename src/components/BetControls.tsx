import { MAX_BET, MIN_BET, MAX_PICKS } from '../utils/payouts';

type Props = {
  balance: number;
  bet: number;
  selectedCount: number;
  canBet: boolean;
  playing: boolean;
  onBetChange: (n: number) => void;
  onRandom: () => void;
  onClear: () => void;
  onBet: () => void;
};

export function BetControls({
  balance,
  bet,
  selectedCount,
  canBet,
  playing,
  onBetChange,
  onRandom,
  onClear,
  onBet,
}: Props) {
  return (
    <div className="bet-bar">
      <div className="bet-row-stats">
        <div className="meta-pill">
          <span className="meta-label">Balance</span>
          <span className="meta-value gold">${balance.toLocaleString()}</span>
        </div>
        <div className="meta-pill">
          <span className="meta-label">Picks</span>
          <span className="meta-value">
            {selectedCount}/{MAX_PICKS}
          </span>
        </div>
        <div className="bet-amount">
          <span className="meta-label">Bet USD</span>
          <div className="bet-stepper">
            <button
              type="button"
              className="btn-step"
              disabled={playing}
              onClick={() => onBetChange(bet - 1)}
            >
              −
            </button>
            <input
              type="number"
              min={MIN_BET}
              max={MAX_BET}
              value={bet}
              disabled={playing}
              onChange={(e) => onBetChange(Number(e.target.value))}
              aria-label="Bet amount"
            />
            <button
              type="button"
              className="btn-step"
              disabled={playing}
              onClick={() => onBetChange(bet + 1)}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="bet-row-actions">
        <button type="button" className="btn-secondary" disabled={playing} onClick={onRandom}>
          Random
        </button>
        <button type="button" className="btn-secondary" disabled={playing} onClick={onClear}>
          Clear
        </button>
        <button type="button" className="btn-bet" disabled={!canBet || playing} onClick={onBet}>
          {playing ? 'Casting…' : 'BET'}
        </button>
      </div>
    </div>
  );
}
