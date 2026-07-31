import { payoutRowsForSpots } from '../utils/payouts';

type Props = {
  spots: number;
};

export function PayoutTable({ spots }: Props) {
  const n = Math.max(1, spots);
  const rows = payoutRowsForSpots(n);
  const paying = rows.filter((r) => r.mult > 0);
  const mid = Math.ceil(paying.length / 2) || 1;
  const top = paying.slice(0, mid);
  const bottom = paying.slice(mid);

  return (
    <aside className="payout-panel" aria-label="Payout table">
      <div className="payout-label">
        <h2 className="payout-title">Payouts</h2>
        <span className="payout-sub">
          {spots < 1 ? 'Pick spots' : `${n} spot · ~97% RTP`}
        </span>
      </div>
      <div className="payout-table">
        {paying.length === 0 ? (
          <div className="payout-table-line">
            <div className="payout-row">
              <span className="payout-hit">—</span>
              <span className="gold payout-mult">Pick</span>
            </div>
          </div>
        ) : (
          <>
            <div className="payout-table-line">
              {top.map((r) => (
                <div key={r.hits} className="payout-row">
                  <span className="payout-hit">{r.hits}</span>
                  <span className="gold payout-mult">{formatMult(r.mult)}</span>
                </div>
              ))}
            </div>
            {bottom.length > 0 && (
              <div className="payout-table-line">
                {bottom.map((r) => (
                  <div key={r.hits} className="payout-row">
                    <span className="payout-hit">{r.hits}</span>
                    <span className="gold payout-mult">{formatMult(r.mult)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function formatMult(m: number): string {
  if (m >= 10) return `${Math.round(m)}x`;
  if (Number.isInteger(m) || Math.abs(m * 10 - Math.round(m * 10)) < 1e-6) {
    return `${m.toFixed(1)}x`;
  }
  return `${m.toFixed(2)}x`;
}
