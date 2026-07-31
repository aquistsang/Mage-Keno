import { MAX_PICKS, payoutRowsForSpots } from '../utils/payouts';

type Props = {
  spots: number;
};

export function PayoutTable({ spots }: Props) {
  // Show full table for current spots; default to max picks so 1–10 stay visible
  const n = spots >= 1 ? spots : MAX_PICKS;
  const rows = payoutRowsForSpots(n);
  const top = rows.filter((r) => r.hits <= 5);
  const bottom = rows.filter((r) => r.hits > 5);

  return (
    <aside className="payout-panel" aria-label="Payout table">
      <div className="payout-label">
        <h2 className="payout-title">Payouts</h2>
        <span className="payout-sub">
          {spots < 1 ? 'Pick spots · ~97% RTP' : `${n} spot · ~97% RTP`}
        </span>
      </div>
      <div className="payout-table">
        <div className="payout-table-line">
          {top.map((r) => (
            <div key={r.hits} className={`payout-row${r.mult <= 0 ? ' is-zero' : ''}`}>
              <span className="payout-hit">{r.hits}</span>
              <span className="gold payout-mult">{formatMult(r.mult)}</span>
            </div>
          ))}
        </div>
        {bottom.length > 0 && (
          <div className="payout-table-line">
            {bottom.map((r) => (
              <div key={r.hits} className={`payout-row${r.mult <= 0 ? ' is-zero' : ''}`}>
                <span className="payout-hit">{r.hits}</span>
                <span className="gold payout-mult">{formatMult(r.mult)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function formatMult(m: number): string {
  if (m <= 0) return '0x';
  if (m >= 10) return `${Math.round(m)}x`;
  if (Number.isInteger(m) || Math.abs(m * 10 - Math.round(m * 10)) < 1e-6) {
    return `${m.toFixed(1)}x`;
  }
  return `${m.toFixed(2)}x`;
}
