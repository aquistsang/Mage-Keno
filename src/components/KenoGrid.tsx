import type { RefObject } from 'react';
import { COLS, GRID_SIZE, ROWS } from '../utils/payouts';
import type { BallVisualState } from '../hooks/useKenoGame';

type Props = {
  selected: Set<number>;
  ballState: Map<number, BallVisualState>;
  disabled?: boolean;
  onToggle: (n: number) => void;
  gridRef?: RefObject<HTMLDivElement | null>;
};

const stateClass: Record<BallVisualState, string> = {
  idle: 'ball-idle',
  selected: 'ball-selected',
  miss: 'ball-miss',
  hit: 'ball-hit',
};

export function KenoGrid({ selected, ballState, disabled, onToggle, gridRef }: Props) {
  const numbers = Array.from({ length: GRID_SIZE }, (_, i) => i + 1);

  return (
    <div
      ref={gridRef}
      className="keno-grid"
      style={{
        gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
      }}
    >
      {numbers.map((n) => {
        const visual = ballState.get(n) ?? (selected.has(n) ? 'selected' : 'idle');
        return (
          <button
            key={n}
            type="button"
            data-num={n}
            disabled={disabled}
            className={`keno-ball ${stateClass[visual]}`}
            onClick={() => onToggle(n)}
            aria-pressed={selected.has(n)}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
