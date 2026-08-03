/**
 * Provably-fair local draw for Mage Keno.
 * Draw = Fisher–Yates shuffle driven by SHA-256(serverSeed:clientSeed:nonce:i).
 * When embedded, TriBet host owns settlement RNG — this session still shows
 * client seed / theoretical RTP for transparency.
 */

const CLIENT_SEED_KEY = 'mage-keno-client-seed';

function randomSeed(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function loadClientSeed(): string {
  try {
    const stored = localStorage.getItem(CLIENT_SEED_KEY);
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  return randomSeed();
}

export type FairnessSnapshot = {
  serverSeedHash: string;
  /** Revealed after the round settles (local only). */
  serverSeed: string | null;
  clientSeed: string;
  nonce: number;
  lastDrawHash: string | null;
  hostSettled: boolean;
};

export class Fairness {
  serverSeed = '';
  serverSeedHash = '';
  clientSeed = loadClientSeed();
  nonce = 0;
  lastDrawHash: string | null = null;
  /** True when the last round was settled by the TriBet host bridge. */
  hostSettled = false;
  ready = false;

  async initSession(): Promise<void> {
    this.serverSeed = randomSeed();
    this.serverSeedHash = await sha256Hex(this.serverSeed);
    this.nonce = 0;
    this.lastDrawHash = null;
    this.hostSettled = false;
    this.ready = true;
    try {
      localStorage.setItem(CLIENT_SEED_KEY, this.clientSeed);
    } catch {
      /* ignore */
    }
  }

  snapshot(): FairnessSnapshot {
    return {
      serverSeedHash: this.serverSeedHash || '—',
      serverSeed: null,
      clientSeed: this.clientSeed || '—',
      nonce: this.nonce,
      lastDrawHash: this.lastDrawHash,
      hostSettled: this.hostSettled,
    };
  }

  /**
   * Provably-fair 20-ball draw for standalone play.
   * Advances nonce and rotates to a fresh server seed (hash committed next round).
   */
  async nextDraw(count: number, max: number): Promise<{
    numbers: number[];
    snapshot: FairnessSnapshot;
  }> {
    if (!this.ready) await this.initSession();

    const usedNonce = this.nonce;
    const usedServer = this.serverSeed;
    const payloadBase = `${usedServer}:${this.clientSeed}:${usedNonce}`;
    this.lastDrawHash = await sha256Hex(payloadBase);
    this.hostSettled = false;

    const pool = Array.from({ length: max }, (_, i) => i + 1);
    let cursor = 0;
    const nextUint = async (): Promise<number> => {
      const h = await sha256Hex(`${payloadBase}:${cursor}`);
      cursor += 1;
      return parseInt(h.slice(0, 8), 16);
    };

    for (let i = pool.length - 1; i > 0; i--) {
      const r = await nextUint();
      const j = r % (i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const numbers = pool.slice(0, count).sort((a, b) => a - b);

    this.nonce = usedNonce + 1;
    this.serverSeed = randomSeed();
    this.serverSeedHash = await sha256Hex(this.serverSeed);

    // Footer shows next committed hash; last draw reveals the seed that was used.
    const snapshot: FairnessSnapshot = {
      serverSeedHash: this.serverSeedHash,
      serverSeed: usedServer,
      clientSeed: this.clientSeed,
      nonce: this.nonce,
      lastDrawHash: this.lastDrawHash,
      hostSettled: false,
    };

    return { numbers, snapshot };
  }

  /** Mark that host settled this round (no local seed reveal for the draw). */
  markHostSettled(): FairnessSnapshot {
    this.hostSettled = true;
    this.lastDrawHash = null;
    this.nonce += 1;
    return {
      serverSeedHash: this.serverSeedHash || '—',
      serverSeed: null,
      clientSeed: this.clientSeed,
      nonce: this.nonce,
      lastDrawHash: null,
      hostSettled: true,
    };
  }

  shortHash(value = this.serverSeedHash): string {
    if (!value || value === '—') return '—';
    return value.length > 16 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
  }
}
