import { PAYOUT_BY_MATCHES } from '../utils/payouts';

export function PayoutTable() {
  const rows = Object.entries(PAYOUT_BY_MATCHES)
    .map(([m, x]) => ({ matches: Number(m), mult: x }))
    .filter((r) => r.matches > 0);

  return (
    <aside className="payout-panel" aria-label="Payout table">
      <div className="payout-label">
        <h2 className="payout-title">Payouts</h2>
        <span className="payout-sub">Hits × bet</span>
      </div>
      <div className="payout-table">
        {rows.map((r) => (
          <div key={r.matches} className="payout-row">
            <span className="payout-hit">{r.matches}</span>
            <span className="gold payout-mult">{r.mult.toFixed(1)}x</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
