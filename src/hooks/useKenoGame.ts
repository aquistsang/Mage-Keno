import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_BET,
  DRAW_COUNT,
  GRID_SIZE,
  MAX_BET,
  MAX_PICKS,
  MIN_BET,
  START_BALANCE,
  pickRandomNumbers,
  payoutMultiplier,
} from '../utils/payouts';

export type GamePhase = 'idle' | 'playing' | 'result';

export type BallVisualState = 'idle' | 'selected' | 'miss' | 'hit';

export type UseKenoGameResult = {
  balance: number;
  bet: number;
  setBet: (n: number) => void;
  selected: Set<number>;
  toggleNumber: (n: number) => void;
  clearSelection: () => void;
  randomSelect: () => void;
  phase: GamePhase;
  revealed: number[];
  ballState: Map<number, BallVisualState>;
  lastWin: number;
  lastMatches: number;
  lastMultiplier: number;
  drawQueue: number[];
  animatingNumber: number | null;
  flashHit: boolean;
  canBet: boolean;
  startBet: () => void;
  dismissResult: () => void;
  onFireballImpact: (n: number) => void;
  onSequenceComplete: () => void;
  /** Stays set for the full cast so canvas remounts can restart the sequence. */
  activeDraw: { id: number; numbers: number[] } | null;
};

export function useKenoGame(): UseKenoGameResult {
  const [balance, setBalance] = useState(START_BALANCE);
  const [bet, setBetState] = useState(DEFAULT_BET);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [revealed, setRevealed] = useState<number[]>([]);
  const [ballState, setBallState] = useState<Map<number, BallVisualState>>(() => new Map());
  const [lastWin, setLastWin] = useState(0);
  const [lastMatches, setLastMatches] = useState(0);
  const [lastMultiplier, setLastMultiplier] = useState(0);
  const [drawQueue, setDrawQueue] = useState<number[]>([]);
  const [animatingNumber, setAnimatingNumber] = useState<number | null>(null);
  const [flashHit, setFlashHit] = useState(false);
  const [activeDraw, setActiveDraw] = useState<{ id: number; numbers: number[] } | null>(null);
  const drawIdRef = useRef(0);

  const selectedRef = useRef(selected);
  const betRef = useRef(bet);
  const balanceRef = useRef(balance);
  const revealedRef = useRef(revealed);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    betRef.current = bet;
  }, [bet]);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);
  useEffect(() => {
    revealedRef.current = revealed;
  }, [revealed]);

  const setBet = useCallback((n: number) => {
    const v = Math.max(MIN_BET, Math.min(MAX_BET, Math.floor(Number(n)) || MIN_BET));
    setBetState(v);
  }, []);

  const resetBoardVisuals = useCallback(() => {
    setRevealed([]);
    setBallState(new Map());
    setLastWin(0);
    setLastMatches(0);
    setLastMultiplier(0);
  }, []);

  const toggleNumber = useCallback(
    (n: number) => {
      if (phase === 'playing') return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(n)) next.delete(n);
        else if (next.size < MAX_PICKS) next.add(n);
        return next;
      });
      setPhase('idle');
      resetBoardVisuals();
    },
    [phase, resetBoardVisuals],
  );

  const clearSelection = useCallback(() => {
    if (phase === 'playing') return;
    setSelected(new Set());
    setPhase('idle');
    resetBoardVisuals();
  }, [phase, resetBoardVisuals]);

  const randomSelect = useCallback(() => {
    if (phase === 'playing') return;
    setSelected(new Set(pickRandomNumbers(MAX_PICKS, GRID_SIZE)));
    setPhase('idle');
    resetBoardVisuals();
  }, [phase, resetBoardVisuals]);

  const startBet = useCallback(() => {
    if (phase === 'playing') return;
    const picks = selectedRef.current;
    if (picks.size < 1) return;
    const amount = Math.max(MIN_BET, Math.min(MAX_BET, betRef.current));
    if (amount > balanceRef.current) return;

    const draw = pickRandomNumbers(DRAW_COUNT, GRID_SIZE);
    setBalance((b) => b - amount);
    setBetState(amount);
    setPhase('playing');
    setRevealed([]);
    setBallState(() => {
      const m = new Map<number, BallVisualState>();
      for (const n of picks) m.set(n, 'selected');
      return m;
    });
    setLastWin(0);
    setLastMatches(0);
    setLastMultiplier(0);
    setDrawQueue(draw);
    setAnimatingNumber(null);
    drawIdRef.current += 1;
    setActiveDraw({ id: drawIdRef.current, numbers: draw });
  }, [phase]);

  const onFireballImpact = useCallback((n: number) => {
    const isHit = selectedRef.current.has(n);
    setAnimatingNumber(n);
    setRevealed((prev) => {
      if (prev.includes(n)) return prev;
      const next = [...prev, n];
      revealedRef.current = next;
      return next;
    });
    setBallState((prev) => {
      const m = new Map(prev);
      m.set(n, isHit ? 'hit' : 'miss');
      return m;
    });
    if (isHit) {
      setFlashHit(true);
      window.setTimeout(() => setFlashHit(false), 180);
    }
  }, []);

  const onSequenceComplete = useCallback(() => {
    const picks = selectedRef.current;
    const current = revealedRef.current;
    const matches = current.filter((n) => picks.has(n)).length;
    const mult = payoutMultiplier(matches, picks.size);
    const win = Math.floor(betRef.current * mult);
    setLastMatches(matches);
    setLastMultiplier(mult);
    setLastWin(win);
    if (win > 0) setBalance((b) => b + win);
    setPhase('result');
    setAnimatingNumber(null);
    setActiveDraw(null);
  }, []);

  const dismissResult = useCallback(() => {
    setPhase('idle');
  }, []);

  const canBet =
    phase !== 'playing' && selected.size >= 1 && bet >= MIN_BET && bet <= balance;

  return {
    balance,
    bet,
    setBet,
    selected,
    toggleNumber,
    clearSelection,
    randomSelect,
    phase,
    revealed,
    ballState,
    lastWin,
    lastMatches,
    lastMultiplier,
    drawQueue,
    animatingNumber,
    flashHit,
    canBet,
    startBet,
    dismissResult,
    onFireballImpact,
    onSequenceComplete,
    activeDraw,
  };
}
