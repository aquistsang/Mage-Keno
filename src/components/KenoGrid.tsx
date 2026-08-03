import type { RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GRID_SIZE } from '../utils/payouts';
import type { BallVisualState } from '../hooks/useKenoGame';

type Props = {
  selected: Set<number>;
  ballState: Map<number, BallVisualState>;
  animatingNumber?: number | null;
  disabled?: boolean;
  onToggle: (n: number) => void;
  gridRef?: RefObject<HTMLDivElement | null>;
};

const stateClass: Record<BallVisualState, string> = {
  idle: 'ball-idle',
  selected: 'ball-selected',
  miss: 'ball-miss',
  hit: 'ball-hit',
};

const PICK_GOBLIN_WEBM = './assets/pick-goblin.webm';
const PICK_GOBLIN_PNG = './assets/pick-goblin.png';
/** Stunned / dead goblin shown when a pick matches the draw */
const PICK_GOBLIN_HIT_PNG = './assets/pick-mark-hit.png';

function isMobileUi(): boolean {
  if (typeof window === 'undefined') return false;
  const rootW = document.getElementById('root')?.clientWidth ?? 0;
  if (rootW > 0) return rootW < 860;
  return (
    window.matchMedia('(max-width: 860px)').matches ||
    window.matchMedia('(pointer: coarse)').matches
  );
}

/** Desktop paints at 12fps; mobile at 8fps to save battery/RAM. */
function paintHz(): number {
  return isMobileUi() ? 8 : 12;
}

function canvasSize(): number {
  return isMobileUi() ? 64 : 96;
}

type SharedGoblinApi = {
  register: (canvas: HTMLCanvasElement) => void;
  unregister: (canvas: HTMLCanvasElement) => void;
};

function GoblinMark({
  hit,
  api,
  fallback,
}: {
  hit: boolean;
  api: SharedGoblinApi;
  fallback: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const markClass = `keno-pick-mark${hit ? ' is-hit-mark' : ''}`;

  useEffect(() => {
    // Hits use the static stunned art — don't register for the live animation
    if (hit) return;
    const canvas = canvasRef.current;
    if (!canvas || fallback) return;
    const size = canvasSize();
    canvas.width = size;
    canvas.height = size;
    api.register(canvas);
    return () => api.unregister(canvas);
  }, [api, fallback, hit]);

  if (hit) {
    return (
      <img src={PICK_GOBLIN_HIT_PNG} alt="" className={markClass} draggable={false} />
    );
  }

  if (fallback) {
    return <img src={PICK_GOBLIN_PNG} alt="" className={markClass} draggable={false} />;
  }

  return <canvas ref={canvasRef} className={markClass} aria-hidden="true" />;
}

export function KenoGrid({
  selected,
  ballState,
  animatingNumber = null,
  disabled,
  onToggle,
  gridRef,
}: Props) {
  const numbers = useMemo(() => Array.from({ length: GRID_SIZE }, (_, i) => i + 1), []);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasesRef = useRef(new Set<HTMLCanvasElement>());
  const [fallback, setFallback] = useState(false);

  const api = useMemo<SharedGoblinApi>(
    () => ({
      register: (canvas) => {
        canvasesRef.current.add(canvas);
      },
      unregister: (canvas) => {
        canvasesRef.current.delete(canvas);
      },
    }),
    [],
  );

  let liveCount = 0;
  for (const num of numbers) {
    const visual = ballState.get(num) ?? (selected.has(num) ? 'selected' : 'idle');
    if (visual === 'selected') liveCount += 1;
  }

  // One shared decoder — play only while non-hit picks are showing
  useEffect(() => {
    const video = videoRef.current;
    if (!video || fallback) return;

    if (liveCount === 0) {
      video.pause();
      return;
    }

    const play = () => {
      video.play().catch(() => setFallback(true));
    };

    if (video.readyState >= 2) play();
    else video.addEventListener('loadeddata', play, { once: true });

    return () => video.removeEventListener('loadeddata', play);
  }, [liveCount, fallback]);

  // Paint all pick canvases from the single video frame
  useEffect(() => {
    if (fallback) return;

    let raf = 0;
    let lastPaint = 0;
    const interval = 1000 / paintHz();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (canvasesRef.current.size === 0) return;
      if (now - lastPaint < interval) return;
      lastPaint = now;

      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.paused) return;

      for (const canvas of canvasesRef.current) {
        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) continue;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fallback]);

  return (
    <div ref={gridRef} className="keno-grid">
      {!fallback && (
        <video
          ref={videoRef}
          className="keno-goblin-shared"
          muted
          loop
          playsInline
          preload="metadata"
          onError={() => setFallback(true)}
          aria-hidden="true"
        >
          <source src={PICK_GOBLIN_WEBM} type="video/webm" />
        </video>
      )}

      {numbers.map((n) => {
        const visual = ballState.get(n) ?? (selected.has(n) ? 'selected' : 'idle');
        const flipped = visual === 'selected' || visual === 'hit';
        const hitImpact = visual === 'hit' && animatingNumber === n;
        return (
          <button
            key={n}
            type="button"
            data-num={n}
            disabled={disabled}
            className={`keno-ball ${stateClass[visual]} ${flipped ? 'is-flipped' : ''}${
              hitImpact ? ' is-hit-impact' : ''
            }`}
            onClick={() => onToggle(n)}
            aria-pressed={selected.has(n)}
            aria-label={
              visual === 'hit'
                ? `Number ${n} matched`
                : flipped
                  ? `Number ${n} selected`
                  : `Number ${n}`
            }
          >
            <span className="keno-ball-inner">
              <span className="keno-ball-face keno-ball-front">{n}</span>
              <span className="keno-ball-face keno-ball-back" aria-hidden="true">
                {flipped ? <GoblinMark hit={visual === 'hit'} api={api} fallback={fallback} /> : null}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
