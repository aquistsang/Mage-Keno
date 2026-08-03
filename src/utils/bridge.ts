/** TriBet Game Bridge client (Class A iframe) — channel must match `src/lib/gameBridge.js`. */
export const CHANNEL = 'tribet-game';

export type BridgeInit = { type: 'init'; balance: number; currency?: string };
export type BridgeSettled = {
  type: 'settled';
  id: string;
  outcomeIndex: number;
  multiplier: number;
  payout: number;
  isWin: boolean;
  balance: number;
};
export type BridgeRejected = {
  type: 'rejected';
  id: string;
  reason: string;
  balance: number;
};

export type BridgeOutcome = {
  label: string;
  weight: number;
  multiplier: number;
};

const pending = new Map<string, (msg: BridgeSettled | BridgeRejected) => void>();
let listening = false;
let initHandler: ((msg: BridgeInit) => void) | null = null;

function post(msg: Record<string, unknown>) {
  if (typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage({ channel: CHANNEL, ...msg }, '*');
}

function onMessage(e: MessageEvent) {
  const data = e.data as Record<string, unknown> | null;
  if (!data || data.channel !== CHANNEL) return;
  if (data.type === 'init') {
    initHandler?.(data as unknown as BridgeInit);
    return;
  }
  if (data.type === 'settled' || data.type === 'rejected') {
    const id = String(data.id ?? '');
    const resolve = pending.get(id);
    if (resolve) {
      pending.delete(id);
      resolve(data as unknown as BridgeSettled | BridgeRejected);
    }
  }
}

/** True when running inside a TriBet host iframe. */
export function isEmbedded(): boolean {
  return typeof window !== 'undefined' && window.parent !== window;
}

/**
 * Announce GameReady and listen for `init` / settle replies.
 * Safe to call once on mount; no-ops when not embedded.
 */
export function connectBridge(handlers: {
  onInit: (balance: number, currency?: string) => void;
}): () => void {
  if (!isEmbedded()) return () => {};

  initHandler = (msg) => {
    handlers.onInit(Number(msg.balance) || 0, msg.currency);
  };

  if (!listening) {
    window.addEventListener('message', onMessage);
    listening = true;
  }

  post({ type: 'ready' });

  return () => {
    pending.clear();
    initHandler = null;
  };
}

/** Place a bet through the host (mock or on-chain). */
export function placeBet(
  amount: number,
  outcomes: BridgeOutcome[],
  meta?: Record<string, unknown>,
): Promise<BridgeSettled | BridgeRejected> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve) => {
    if (!isEmbedded()) {
      resolve({ type: 'rejected', id, reason: 'not-embedded', balance: 0 });
      return;
    }
    pending.set(id, resolve);
    post({ type: 'bet', id, amount, outcomes, meta });
  });
}
