export const GRID_SIZE = 40;
export const COLS = 8;
export const ROWS = 5;
export const MAX_PICKS = 10;
export const DRAW_COUNT = 20;
export const START_BALANCE = 1000;
export const MIN_BET = 1;
export const MAX_BET = 500;
export const DEFAULT_BET = 10;

/** Multiplier by number of matching hits (independent of pick count for this build). */
export const PAYOUT_BY_MATCHES: Record<number, number> = {
  0: 0,
  1: 1,
  2: 2,
  3: 5,
  4: 12,
  5: 25,
  6: 50,
  7: 100,
  8: 250,
  9: 500,
  10: 1000,
};

export function payoutMultiplier(matches: number): number {
  return PAYOUT_BY_MATCHES[Math.min(10, Math.max(0, matches))] ?? 0;
}

export function pickRandomNumbers(count: number, max = GRID_SIZE): number[] {
  const pool = Array.from({ length: max }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}
