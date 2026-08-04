import { MAX_PICKS, payoutRowsForDisplay } from '../utils/payouts';

type Props = {
  spots: number;
};

export function PayoutTable({ spots }: Props) {
  const n = spots >= 1 ? spots : 0;
  const rows = payoutRowsForDisplay(spots);

  return (
    <aside className="payout-panel" aria-label="Payout table">
      <div className="payout-label">
        <h2 className="payout-title">Payouts</h2>
        <span className="payout-sub">
          <span className="payout-spots">{n}</span>/{MAX_PICKS} picks
        </span>
      </div>
      <div className="payout-table" role="list">
        {rows.map((r) => (
          <div
            key={r.hits}
            role="listitem"
            className={`payout-row${r.mult <= 0 || !r.possible ? ' is-zero' : ''}`}
            title={
              r.possible
                ? `${r.hits} hit${r.hits === 1 ? '' : 's'} → ${formatMult(r.mult)}`
                : `Need ${r.hits} picks to unlock`
            }
          >
            <span className="payout-hit">{r.hits}</span>
            <span className="gold payout-mult">
              {r.possible ? formatMult(r.mult) : '—'}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function formatMult(m: number): string {
  if (m <= 0) return '0×';
  if (m >= 10) return `${Math.round(m)}×`;
  if (Number.isInteger(m) || Math.abs(m * 10 - Math.round(m * 10)) < 1e-6) {
    return `${m.toFixed(1)}×`;
  }
  return `${m.toFixed(2)}×`;
}
