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

/** Theoretical RTP for each spot count (hypergeometric, independent draws). */
export const RTP_BY_SPOTS: Record<number, number> = {
  1: 0.97,
  2: 0.9695,
  3: 0.9696,
  4: 0.9698,
  5: 0.97,
  6: 0.97,
  7: 0.97,
  8: 0.97,
  9: 0.97,
  10: 0.97,
};

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

export function pickRandomNumbers(count: number, max = GRID_SIZE): number[] {
  const pool = Array.from({ length: max }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}
