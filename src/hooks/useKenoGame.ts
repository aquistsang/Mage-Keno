import { useCallback, useEffect, useRef, useState } from 'react';
import { connectBridge, isEmbedded, placeBet } from '../utils/bridge';
import { Fairness, type FairnessSnapshot } from '../utils/fairness';
import {
  DEFAULT_BET,
  DRAW_COUNT,
  GRID_SIZE,
  MAX_BET,
  MAX_PICKS,
  MIN_BET,
  START_BALANCE,
  bridgeOutcomesForSpots,
  drawConsistentWithHits,
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
  fairness: FairnessSnapshot;
  shortHash: (value?: string) => string;
};

type SettledRound = {
  matches: number;
  mult: number;
  win: number;
  balance: number;
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
  const [fairnessSnap, setFairnessSnap] = useState<FairnessSnapshot>(() => ({
    serverSeedHash: '—',
    serverSeed: null,
    clientSeed: '—',
    nonce: 0,
    lastDrawHash: null,
    hostSettled: false,
  }));
  const drawIdRef = useRef(0);
  const fairnessRef = useRef(new Fairness());

  const selectedRef = useRef(selected);
  const betRef = useRef(bet);
  const balanceRef = useRef(balance);
  const revealedRef = useRef(revealed);
  const bridgeActiveRef = useRef(false);
  const settledRef = useRef<SettledRound | null>(null);
  const bettingLockRef = useRef(false);

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

  // Class A: announce GameReady; host replies with init { balance }
  useEffect(() => {
    void fairnessRef.current.initSession().then(() => {
      setFairnessSnap(fairnessRef.current.snapshot());
    });
    return connectBridge({
      onInit: (bal) => {
        bridgeActiveRef.current = true;
        setBalance(bal);
      },
    });
  }, []);

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

  const beginRound = useCallback(
    (picks: Set<number>, amount: number, draw: number[]) => {
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
    },
    [],
  );

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
    if (phase === 'playing' || bettingLockRef.current) return;
    const picks = selectedRef.current;
    if (picks.size < 1) return;
    const amount = Math.max(MIN_BET, Math.min(MAX_BET, betRef.current));
    if (amount > balanceRef.current) return;

    const runLocal = () => {
      settledRef.current = null;
      bettingLockRef.current = true;
      void fairnessRef.current.nextDraw(DRAW_COUNT, GRID_SIZE).then(({ numbers, snapshot }) => {
        bettingLockRef.current = false;
        setFairnessSnap(snapshot);
        setBalance((b) => b - amount);
        beginRound(picks, amount, numbers);
      });
    };

    // Embedded: host owns RNG + balance (bridge). Standalone: local seeded draw.
    if (bridgeActiveRef.current || isEmbedded()) {
      bettingLockRef.current = true;
      const outcomes = bridgeOutcomesForSpots(picks.size);
      void placeBet(amount, outcomes, {
        spots: picks.size,
        picks: [...picks],
      }).then((res) => {
        bettingLockRef.current = false;
        if (res.type === 'rejected') {
          // Fall back to local if host not ready yet
          if (res.reason === 'not-embedded') runLocal();
          return;
        }
        bridgeActiveRef.current = true;
        settledRef.current = {
          matches: res.outcomeIndex,
          mult: res.multiplier,
          win: Math.floor(res.payout),
          balance: res.balance,
        };
        setFairnessSnap(fairnessRef.current.markHostSettled());
        setBalance(res.balance);
        const draw = drawConsistentWithHits([...picks], res.outcomeIndex);
        beginRound(picks, amount, draw);
      });
      return;
    }

    runLocal();
  }, [phase, beginRound]);

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
    const settled = settledRef.current;
    if (settled) {
      setLastMatches(settled.matches);
      setLastMultiplier(settled.mult);
      setLastWin(settled.win);
      setBalance(settled.balance);
      settledRef.current = null;
    } else {
      const picks = selectedRef.current;
      const current = revealedRef.current;
      const matches = current.filter((n) => picks.has(n)).length;
      const mult = payoutMultiplier(matches, picks.size);
      const win = Math.floor(betRef.current * mult);
      setLastMatches(matches);
      setLastMultiplier(mult);
      setLastWin(win);
      if (win > 0) setBalance((b) => b + win);
    }
    setPhase('result');
    setAnimatingNumber(null);
    setActiveDraw(null);
  }, []);

  const dismissResult = useCallback(() => {
    setPhase('idle');
  }, []);

  const canBet =
    phase !== 'playing' && selected.size >= 1 && bet >= MIN_BET && bet <= balance;

  const shortHash = useCallback(
    (value?: string) => fairnessRef.current.shortHash(value),
    [],
  );

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
    fairness: fairnessSnap,
    shortHash,
  };
}
