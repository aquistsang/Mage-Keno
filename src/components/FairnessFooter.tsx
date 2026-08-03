import { useMemo, useState } from 'react';
import {
  MAX_PICKS,
  computeHouseEdge,
  computeTheoreticalRtp,
} from '../utils/payouts';
import type { FairnessSnapshot } from '../utils/fairness';

type Props = {
  spots: number;
  fairness: FairnessSnapshot;
  shortHash: (value?: string) => string;
};

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

export function FairnessFooter({ spots, fairness, shortHash }: Props) {
  const [open, setOpen] = useState(false);
  const n = spots >= 1 ? Math.min(MAX_PICKS, spots) : MAX_PICKS;
  const rtp = useMemo(() => computeTheoreticalRtp(n), [n]);
  const edge = useMemo(() => computeHouseEdge(n), [n]);

  return (
    <>
      <footer className="fairness-footer" aria-label="RTP and fairness">
        <div className="fairness-footer-main">
          <span>
            RTP <strong className="gold">{pct(rtp)}</strong>
          </span>
          <span className="fairness-sep">·</span>
          <span>
            Edge <strong>{pct(edge)}</strong>
          </span>
          <span className="fairness-sep">·</span>
          <span className="fairness-seed" title={fairness.serverSeedHash}>
            Seed <strong className="fairness-mono">{shortHash(fairness.serverSeedHash)}</strong>
          </span>
        </div>
        <button type="button" className="fairness-open-btn" onClick={() => setOpen(true)}>
          Fairness
        </button>
      </footer>

      {open && (
        <div
          className="fairness-modal"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="fairness-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fairness-title"
          >
            <h2 id="fairness-title">Fairness & RTP</h2>
            <p className="fairness-lead">
              Hypergeometric Keno · 40 balls · draw 20 · pick {n}. Theoretical RTP{' '}
              <strong className="gold">{pct(rtp)}</strong> (house edge {pct(edge)}). Local draws
              use SHA-256(server : client : nonce); TriBet embed settles via host RNG.
            </p>
            <dl className="fairness-list">
              <div className="fairness-row">
                <dt>RTP ({n} picks)</dt>
                <dd>
                  <strong className="gold">{pct(rtp)}</strong>
                </dd>
              </div>
              <div className="fairness-row">
                <dt>House edge</dt>
                <dd>
                  <strong>{pct(edge)}</strong>
                </dd>
              </div>
              <div className="fairness-row">
                <dt>Next hash</dt>
                <dd>
                  <strong className="fairness-mono" title={fairness.serverSeedHash}>
                    {shortHash(fairness.serverSeedHash)}
                  </strong>
                  <CopyBtn value={fairness.serverSeedHash} />
                </dd>
              </div>
              <div className="fairness-row">
                <dt>Client seed</dt>
                <dd>
                  <strong className="fairness-mono" title={fairness.clientSeed}>
                    {shortHash(fairness.clientSeed)}
                  </strong>
                  <CopyBtn value={fairness.clientSeed} />
                </dd>
              </div>
              <div className="fairness-row">
                <dt>Nonce</dt>
                <dd>
                  <strong>{fairness.nonce}</strong>
                </dd>
              </div>
              <div className="fairness-row">
                <dt>Last seed</dt>
                <dd>
                  <strong className="fairness-mono">
                    {fairness.hostSettled
                      ? 'Host settled'
                      : fairness.serverSeed
                        ? shortHash(fairness.serverSeed)
                        : '—'}
                  </strong>
                  {fairness.serverSeed ? <CopyBtn value={fairness.serverSeed} /> : null}
                </dd>
              </div>
            </dl>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function CopyBtn({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  if (!value || value === '—') return null;
  return (
    <button
      type="button"
      className="fairness-copy"
      title="Copy"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setOk(true);
          window.setTimeout(() => setOk(false), 1200);
        });
      }}
    >
      {ok ? 'Copied' : 'Copy'}
    </button>
  );
}
