export const GRID_SIZE = 40;
export const COLS = 8;
export const ROWS = 5;
export const MAX_PICKS = 10;
export const DRAW_COUNT = 20;
export const START_BALANCE = 1000;
export const MIN_BET = 1;
export const MAX_BET = 500;
export const DEFAULT_BET = 10;

/**
 * Payout multipliers by (spots picked → hit count).
 * Tuned for ~97% RTP under hypergeometric Keno:
 *   N=40 balls, draw K=20, player picks n spots.
 * E[hits] = n/2, so common "lots of hits" near the mean pay 0 —
 * only above-average hit counts pay out.
 * Verified: house edge ≈ 2.7–3.1% on every spot count (see computeTheoreticalRtp).
 */
export const PAYOUTS_BY_SPOTS: Record<number, Record<number, number>> = {
  1: { 1: 1.94 },
  2: { 2: 3.98 },
  3: { 2: 1.3, 3: 4.1 },
  4: { 3: 2.3, 4: 7.5 },
  5: { 3: 0.95, 4: 2.95, 5: 9.5 },
  6: { 4: 1.6, 5: 5.2, 6: 16.5 },
  7: { 4: 0.7, 5: 2.3, 6: 7.3, 7: 23 },
  8: { 5: 1.2, 6: 3.9, 7: 12.5, 8: 42 },
  9: { 5: 0.55, 6: 1.8, 7: 5.9, 8: 18.5, 9: 65 },
  10: { 6: 0.95, 7: 3.1, 8: 10, 9: 32, 10: 125 },
};

/**
 * Exact theoretical RTP = Σ P(hits=k) × multiplier(k)
 * under Hypergeometric(N=40, K=20, n=spots). Recomputed on load so tables
 * stay honest if multipliers change.
 */
export function computeTheoreticalRtp(spots: number): number {
  const n = Math.max(1, Math.min(MAX_PICKS, Math.floor(spots) || 1));
  const table = PAYOUTS_BY_SPOTS[n] ?? {};
  const total = comb(GRID_SIZE, DRAW_COUNT);
  if (total <= 0) return 0;
  let rtp = 0;
  for (let hits = 0; hits <= n; hits++) {
    const ways = comb(n, hits) * comb(GRID_SIZE - n, DRAW_COUNT - hits);
    const p = ways / total;
    rtp += p * (table[hits] ?? 0);
  }
  return rtp;
}

export function computeHouseEdge(spots: number): number {
  return Math.max(0, 1 - computeTheoreticalRtp(spots));
}

/** Cached exact RTP per spot count (hypergeometric). */
export const RTP_BY_SPOTS: Record<number, number> = Object.fromEntries(
  Array.from({ length: MAX_PICKS }, (_, i) => {
    const n = i + 1;
    return [n, computeTheoreticalRtp(n)];
  }),
) as Record<number, number>;

export function payoutMultiplier(matches: number, spots: number): number {
  const n = Math.max(1, Math.min(MAX_PICKS, Math.floor(spots) || 1));
  const table = PAYOUTS_BY_SPOTS[n];
  if (!table) return 0;
  return table[Math.max(0, Math.min(n, matches))] ?? 0;
}

/** Rows for the payout strip for a given spot count (hit → mult), including 0x gaps. */
export function payoutRowsForSpots(spots: number): { hits: number; mult: number }[] {
  const n = Math.max(1, Math.min(MAX_PICKS, Math.floor(spots) || 1));
  const table = PAYOUTS_BY_SPOTS[n] ?? {};
  return Array.from({ length: n }, (_, i) => {
    const hits = i + 1;
    return { hits, mult: table[hits] ?? 0 };
  });
}

/**
 * Always show hits 1–10. Multipliers come from the current pick-count table;
 * hits above your pick count are marked impossible.
 */
export function payoutRowsForDisplay(
  spots: number,
): { hits: number; mult: number; possible: boolean }[] {
  const n = spots >= 1 ? Math.min(MAX_PICKS, Math.floor(spots)) : MAX_PICKS;
  const table = PAYOUTS_BY_SPOTS[n] ?? {};
  return Array.from({ length: MAX_PICKS }, (_, i) => {
    const hits = i + 1;
    const possible = hits <= n;
    return { hits, mult: possible ? (table[hits] ?? 0) : 0, possible };
  });
}

export function pickRandomNumbers(count: number, max = GRID_SIZE): number[] {
  const pool = Array.from({ length: max }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

/** Binomial coefficient C(n,k). */
function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/**
 * Hypergeometric P(hits = k) weights for bridge settlement
 * (N=40, draw=20, spots=n).
 */
export function hitCountWeights(spots: number): number[] {
  const n = Math.max(1, Math.min(MAX_PICKS, Math.floor(spots) || 1));
  const total = comb(GRID_SIZE, DRAW_COUNT);
  return Array.from({ length: n + 1 }, (_, hits) => {
    const w = comb(n, hits) * comb(GRID_SIZE - n, DRAW_COUNT - hits);
    return total > 0 ? Math.max(0, w / total) : 0;
  });
}

/** Weighted outcomes for host RNG — index = hit count. */
export function bridgeOutcomesForSpots(spots: number): {
  label: string;
  weight: number;
  multiplier: number;
}[] {
  const n = Math.max(1, Math.min(MAX_PICKS, Math.floor(spots) || 1));
  const weights = hitCountWeights(n);
  const table = PAYOUTS_BY_SPOTS[n] ?? {};
  return weights.map((weight, hits) => ({
    label: `${hits}-hit`,
    weight,
    multiplier: table[hits] ?? 0,
  }));
}

/**
 * Build a 20-ball draw that matches exactly `hits` of the player's picks
 * (for animating after the host has already settled the hit count).
 */
export function drawConsistentWithHits(
  picks: number[],
  hits: number,
): number[] {
  const pickSet = [...new Set(picks)].filter((n) => n >= 1 && n <= GRID_SIZE);
  const needHits = Math.max(0, Math.min(pickSet.length, Math.floor(hits)));
  const pickPool = [...pickSet];
  for (let i = pickPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pickPool[i], pickPool[j]] = [pickPool[j], pickPool[i]];
  }
  const hitNums = pickPool.slice(0, needHits);
  const missPool = Array.from({ length: GRID_SIZE }, (_, i) => i + 1).filter(
    (n) => !pickSet.includes(n),
  );
  for (let i = missPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [missPool[i], missPool[j]] = [missPool[j], missPool[i]];
  }
  const needMiss = Math.max(0, DRAW_COUNT - hitNums.length);
  const draw = [...hitNums, ...missPool.slice(0, needMiss)];
  for (let i = draw.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [draw[i], draw[j]] = [draw[j], draw[i]];
  }
  return draw;
}
