import { PAYOUT_BY_MATCHES } from '../utils/payouts';

export function PayoutTable() {
  const rows = Object.entries(PAYOUT_BY_MATCHES)
    .map(([m, x]) => ({ matches: Number(m), mult: x }))
    .filter((r) => r.matches > 0);

  return (
    <aside className="payout-panel" aria-label="Payout table">
      <h2 className="payout-title">Payouts</h2>
      <p className="payout-sub">Matches × bet</p>
      <div className="payout-table">
        <div className="payout-head">
          <span>Hit</span>
          <span>Mult</span>
        </div>
        {rows.map((r) => (
          <div key={r.matches} className="payout-row">
            <span>{r.matches}</span>
            <span className="gold">{r.mult.toFixed(1)}x</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
