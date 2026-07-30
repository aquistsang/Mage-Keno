import type { RefObject } from 'react';
import { GRID_SIZE } from '../utils/payouts';
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

const PICK_MARK_SRC = './assets/pick-mark.png';
const PICK_MARK_HIT_SRC = './assets/pick-mark-hit.png';

export function KenoGrid({ selected, ballState, disabled, onToggle, gridRef }: Props) {
  const numbers = Array.from({ length: GRID_SIZE }, (_, i) => i + 1);

  return (
    <div ref={gridRef} className="keno-grid">
      {numbers.map((n) => {
        const visual = ballState.get(n) ?? (selected.has(n) ? 'selected' : 'idle');
        const flipped = visual === 'selected' || visual === 'hit';
        const markSrc = visual === 'hit' ? PICK_MARK_HIT_SRC : PICK_MARK_SRC;
        return (
          <button
            key={n}
            type="button"
            data-num={n}
            disabled={disabled}
            className={`keno-ball ${stateClass[visual]} ${flipped ? 'is-flipped' : ''}`}
            onClick={() => onToggle(n)}
            aria-pressed={selected.has(n)}
            aria-label={
              visual === 'hit'
                ? `Number ${n} matched`
                : flipped
                  ? `Number ${n} selected`
                  : `Number ${n}`
            }
          >
            <span className="keno-ball-inner">
              <span className="keno-ball-face keno-ball-front">{n}</span>
              <span className="keno-ball-face keno-ball-back" aria-hidden="true">
                <img src={markSrc} alt="" className="keno-pick-mark" draggable={false} />
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
