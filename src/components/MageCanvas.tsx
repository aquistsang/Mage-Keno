import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { drawChromaKeyedFrame } from '../utils/chromaKey';
import {
  drawParticles,
  spawnExplosion,
  updateParticles,
  type Particle,
} from '../utils/particles';

type Props = {
  gridRef: RefObject<HTMLDivElement | null>;
  selected: Set<number>;
  activeDraw: { id: number; numbers: number[] } | null;
  onFireballImpact: (n: number) => void;
  onSequenceComplete: () => void;
};

/** Idle looping mage */
const MAGE_IDLE_SRC = './assets/mage.mp4';
/** Cast animation played on BET */
const MAGE_CAST_SRC = './assets/mage-cast.mp4';
/** Fallback still if video fails to load. */
const MAGE_IMG_SRC = './assets/mage.png';
/** Whoosh SFX per revealed number */
const FIREBALL_WHOOSH_SRC = './assets/fireball-whoosh.mp3';

const REVEAL_INTERVAL_MS = 280;

export function MageCanvas({
  gridRef,
  selected,
  activeDraw,
  onFireballImpact,
  onSequenceComplete,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const idleVideoRef = useRef<HTMLVideoElement | null>(null);
  const castVideoRef = useRef<HTMLVideoElement | null>(null);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const mageImgRef = useRef<HTMLImageElement | null>(null);
  const chromaOffscreenRef = useRef<HTMLCanvasElement | null>(null);
  const lastMageFrameRef = useRef<HTMLCanvasElement | null>(null);
  const videoSeekingRef = useRef(false);
  const castingRef = useRef(false);
  const castDoneRef = useRef(true);
  const whooshRef = useRef<HTMLAudioElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const queueRef = useRef<number[]>([]);
  const runningRef = useRef(false);
  const finishedRef = useRef(false);
  const selectedRef = useRef(selected);
  const flashRef = useRef(0);
  const lastDrawIdRef = useRef<number | null>(null);
  const callbacksRef = useRef({ onFireballImpact, onSequenceComplete });

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    callbacksRef.current = { onFireballImpact, onSequenceComplete };
  }, [onFireballImpact, onSequenceComplete]);

  useEffect(() => {
    chromaOffscreenRef.current = document.createElement('canvas');
    lastMageFrameRef.current = document.createElement('canvas');

    const whoosh = new Audio(FIREBALL_WHOOSH_SRC);
    whoosh.preload = 'auto';
    whoosh.volume = 0.7;
    whooshRef.current = whoosh;

    const makeVideo = (src: string, loopManual: boolean) => {
      const video = document.createElement('video');
      video.src = src;
      video.muted = true;
      video.loop = false;
      video.playsInline = true;
      video.preload = 'auto';
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      if (loopManual) {
        const LOOP_IN = 0.001;
        const LOOP_OUT_PAD = 1 / 24;
        const wrapLoop = () => {
          if (castingRef.current) return;
          if (!Number.isFinite(video.duration) || video.duration <= LOOP_OUT_PAD * 2) return;
          if (video.seeking) return;
          if (video.currentTime >= video.duration - LOOP_OUT_PAD) {
            videoSeekingRef.current = true;
            try {
              video.currentTime = LOOP_IN;
            } catch {
              /* ignore */
            }
          }
        };
        let loopRaf = 0;
        const loopTick = () => {
          wrapLoop();
          loopRaf = requestAnimationFrame(loopTick);
        };
        video.addEventListener('loadeddata', () => {
          cancelAnimationFrame(loopRaf);
          loopRaf = requestAnimationFrame(loopTick);
        });
        video.addEventListener('seeking', () => {
          if (!castingRef.current) videoSeekingRef.current = true;
        });
        video.addEventListener('seeked', () => {
          requestAnimationFrame(() => {
            if (!castingRef.current) videoSeekingRef.current = false;
          });
        });
        (video as HTMLVideoElement & { __stopLoop?: () => void }).__stopLoop = () => {
          cancelAnimationFrame(loopRaf);
        };
      }
      video.load();
      return video;
    };

    const idle = makeVideo(`${MAGE_IDLE_SRC}?v=idle`, true);
    const cast = makeVideo(`${MAGE_CAST_SRC}?v=cast7`, false);
    cast.loop = false;

    idleVideoRef.current = idle;
    castVideoRef.current = cast;
    activeVideoRef.current = idle;

    const tryPlayIdle = () => {
      if (castingRef.current) return;
      idle.play().catch(() => {});
    };

    idle.addEventListener('loadeddata', () => {
      if (!castingRef.current) {
        activeVideoRef.current = idle;
        tryPlayIdle();
      }
    });

    const img = new Image();
    img.src = MAGE_IMG_SRC;
    img.onload = () => {
      mageImgRef.current = img;
    };

    const unlock = () => {
      tryPlayIdle();
      whoosh.play().then(() => {
        whoosh.pause();
        whoosh.currentTime = 0;
      }).catch(() => {});
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      (idle as HTMLVideoElement & { __stopLoop?: () => void }).__stopLoop?.();
      idle.pause();
      cast.pause();
      idle.removeAttribute('src');
      cast.removeAttribute('src');
      idle.load();
      cast.load();
      idleVideoRef.current = null;
      castVideoRef.current = null;
      activeVideoRef.current = null;
      whoosh.pause();
      whooshRef.current = null;
    };
  }, []);

  const getBallCenter = (n: number): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    const grid = gridRef.current;
    if (!canvas || !grid) return null;
    const btn = grid.querySelector<HTMLElement>(`[data-num="${n}"]`);
    if (!btn) return null;
    const cRect = canvas.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    const scaleX = canvas.width / cRect.width;
    const scaleY = canvas.height / cRect.height;
    return {
      x: (bRect.left + bRect.width / 2 - cRect.left) * scaleX,
      y: (bRect.top + bRect.height / 2 - cRect.top) * scaleY,
    };
  };

  const getGridBottom = (): number => {
    const canvas = canvasRef.current;
    const grid = gridRef.current;
    if (!canvas) return 0;
    if (!grid) return canvas.height * 0.92;
    const cRect = canvas.getBoundingClientRect();
    const gRect = grid.getBoundingClientRect();
    if (cRect.height <= 0) return canvas.height * 0.92;
    const scaleY = canvas.height / cRect.height;
    return (gRect.bottom - cRect.top) * scaleY;
  };

  const startCastPlayback = () => {
    const idle = idleVideoRef.current;
    const cast = castVideoRef.current;
    if (!cast) {
      castDoneRef.current = true;
      return;
    }
    castingRef.current = true;
    castDoneRef.current = false;
    videoSeekingRef.current = false;
    idle?.pause();
    cast.loop = false;
    cast.currentTime = 0;
    activeVideoRef.current = cast;

    const finish = () => {
      cast.removeEventListener('ended', finish);
      cast.pause();
      // Return to idle as soon as cast finishes; then number reveals can start
      castingRef.current = false;
      if (idle) {
        activeVideoRef.current = idle;
        idle.play().catch(() => {});
      }
      castDoneRef.current = true;
    };

    cast.addEventListener('ended', finish);
    cast.play().catch(() => {
      finish();
    });
  };

  const stopCastPlayback = () => {
    const idle = idleVideoRef.current;
    const cast = castVideoRef.current;
    castingRef.current = false;
    castDoneRef.current = true;
    cast?.pause();
    if (idle) {
      activeVideoRef.current = idle;
      idle.play().catch(() => {});
    }
  };

  useEffect(() => {
    if (!activeDraw) {
      lastDrawIdRef.current = null;
      return;
    }
    if (lastDrawIdRef.current === activeDraw.id && runningRef.current) return;
    lastDrawIdRef.current = activeDraw.id;
    queueRef.current = [...activeDraw.numbers];
    runningRef.current = true;
    finishedRef.current = false;
    castDoneRef.current = false;
    particlesRef.current = [];
    startCastPlayback();
  }, [activeDraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const completeOnce = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      runningRef.current = false;
      stopCastPlayback();
      callbacksRef.current.onSequenceComplete();
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = wrap.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let raf = 0;
    let last = performance.now();
    let revealTimer: number | null = null;

    const playWhoosh = () => {
      const master = whooshRef.current;
      if (!master) return;
      try {
        const shot = master.cloneNode(true) as HTMLAudioElement;
        shot.volume = master.volume;
        void shot.play().catch(() => {});
      } catch {
        master.currentTime = 0;
        void master.play().catch(() => {});
      }
    };

    const revealNext = () => {
      const next = queueRef.current.shift();
      if (next == null) {
        completeOnce();
        return;
      }
      playWhoosh();
      const hit = selectedRef.current.has(next);
      const at = getBallCenter(next);
      callbacksRef.current.onFireballImpact(next);
      if (at) {
        if (hit) {
          particlesRef.current.push(...spawnExplosion(at.x, at.y, 34));
          flashRef.current = 180;
        } else {
          particlesRef.current.push(
            ...spawnExplosion(at.x, at.y, 10).map((p) => ({
              ...p,
              color: '#ff5a6a',
              vx: p.vx * 0.45,
              vy: p.vy * 0.45,
            })),
          );
        }
      }
      revealTimer = window.setTimeout(() => {
        revealTimer = null;
        if (queueRef.current.length > 0) revealNext();
        else if (particlesRef.current.length === 0) completeOnce();
        else {
          // wait for particles in tick
        }
      }, hit ? REVEAL_INTERVAL_MS + 80 : REVEAL_INTERVAL_MS);
    };

    const drawMage = (ctx: CanvasRenderingContext2D) => {
      const video = activeVideoRef.current;
      const img = mageImgRef.current;
      const off = chromaOffscreenRef.current;
      const lastFrame = lastMageFrameRef.current;

      const seeking =
        videoSeekingRef.current || (video != null && video.seeking);
      const canUseVideo =
        !!video &&
        !seeking &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        Number.isFinite(video.currentTime);

      let srcW = 0;
      let srcH = 0;
      let source: CanvasImageSource | null = null;
      let keyLive = false;

      if (canUseVideo && video) {
        source = video;
        srcW = video.videoWidth;
        srcH = video.videoHeight;
        keyLive = true;
        if (video.paused && castingRef.current && !castDoneRef.current) {
          video.play().catch(() => {});
        }
      } else if (lastFrame && lastFrame.width > 0) {
        source = lastFrame;
        srcW = lastFrame.width;
        srcH = lastFrame.height;
      } else if (img && img.complete && img.naturalWidth > 0) {
        source = img;
        srcW = img.naturalWidth;
        srcH = img.naturalHeight;
      }

      const boxW = canvas.width * 0.34;
      const boxH = canvas.height * 0.92;
      const scale =
        (srcW > 0 && srcH > 0 ? Math.min(boxW / srcW, boxH / srcH) : 1) * 0.9;
      const mageW = srcW > 0 ? srcW * scale : boxW * 0.9;
      const mageH = srcH > 0 ? srcH * scale : boxH * 0.9;
      const mageX = canvas.width * 0.055;
      const gridBottom = getGridBottom();
      const mageY = Math.max(8, (gridBottom || canvas.height * 0.92) - mageH);

      // Cast clip is brighter green; idle uses similar key
      const key = castingRef.current
        ? { keyR: 22, keyG: 223, keyB: 13 }
        : { keyR: 25, keyG: 225, keyB: 13 };

      if (source && off && srcW > 0 && keyLive) {
        drawChromaKeyedFrame(
          ctx,
          source,
          0,
          0,
          srcW,
          srcH,
          mageX,
          mageY,
          mageW,
          mageH,
          off,
          {
            ...key,
            similarity: 0.48,
            blend: 0.04,
            despill: 0.88,
            maxKeyWidth: 560,
          },
        );
        if (lastFrame && off.width > 0) {
          if (lastFrame.width !== off.width || lastFrame.height !== off.height) {
            lastFrame.width = off.width;
            lastFrame.height = off.height;
          }
          const lctx = lastFrame.getContext('2d');
          if (lctx) {
            lctx.clearRect(0, 0, lastFrame.width, lastFrame.height);
            lctx.drawImage(off, 0, 0);
          }
        }
      } else if (source) {
        ctx.drawImage(source, mageX, mageY, mageW, mageH);
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        raf = requestAnimationFrame(tick);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawMage(ctx);

      if (flashRef.current > 0) {
        flashRef.current = Math.max(0, flashRef.current - dt);
        ctx.fillStyle = `rgba(255, 160, 40, ${0.22 * (flashRef.current / 180)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Fallback if 'ended' doesn't fire — mark cast done near the end
      if (castingRef.current && !castDoneRef.current) {
        const cast = castVideoRef.current;
        const idle = idleVideoRef.current;
        if (
          cast &&
          Number.isFinite(cast.duration) &&
          cast.duration > 0 &&
          cast.currentTime >= cast.duration - 0.05
        ) {
          cast.pause();
          castingRef.current = false;
          if (idle) {
            activeVideoRef.current = idle;
            idle.play().catch(() => {});
          }
          castDoneRef.current = true;
        }
      }

      if (
        runningRef.current &&
        castDoneRef.current &&
        queueRef.current.length > 0 &&
        revealTimer == null
      ) {
        revealNext();
      }

      updateParticles(particlesRef.current, dt);
      drawParticles(ctx, particlesRef.current);

      if (
        runningRef.current &&
        castDoneRef.current &&
        revealTimer == null &&
        queueRef.current.length === 0 &&
        particlesRef.current.length === 0
      ) {
        completeOnce();
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (revealTimer != null) window.clearTimeout(revealTimer);
      ro.disconnect();
    };
  }, [gridRef]);

  return (
    <div ref={wrapRef} className="mage-canvas-wrap" aria-hidden="true">
      <canvas ref={canvasRef} className="mage-canvas" />
    </div>
  );
}
