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
  /** True after the staff-impact overlay finishes (or is skipped). */
  impactComplete: boolean;
  onStaffHit: () => void;
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
/** Staff strikes the ground in mage-cast.mp4 around this timestamp. */
const CAST_STAFF_HIT_SEC = 2.9;
/** Keep playing cast this long after the hit before the impact overlay. */
const CAST_AFTER_HIT_HOLD_SEC = 1;

export function MageCanvas({
  gridRef,
  selected,
  activeDraw,
  impactComplete,
  onStaffHit,
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
  const staffHitRef = useRef(false);
  const waitingImpactRef = useRef(false);
  const whooshRef = useRef<HTMLAudioElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const queueRef = useRef<number[]>([]);
  const runningRef = useRef(false);
  const finishedRef = useRef(false);
  const selectedRef = useRef(selected);
  const flashRef = useRef(0);
  const lastDrawIdRef = useRef<number | null>(null);
  const callbacksRef = useRef({ onFireballImpact, onSequenceComplete, onStaffHit });
  const impactCompleteRef = useRef(impactComplete);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    callbacksRef.current = { onFireballImpact, onSequenceComplete, onStaffHit };
  }, [onFireballImpact, onSequenceComplete, onStaffHit]);

  useEffect(() => {
    impactCompleteRef.current = impactComplete;
    // Impact overlay finished — allow number reveals to begin
    if (impactComplete && waitingImpactRef.current && !castDoneRef.current) {
      waitingImpactRef.current = false;
      castDoneRef.current = true;
    }
  }, [impactComplete]);

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

  const getGridTop = (): number => {
    const canvas = canvasRef.current;
    const grid = gridRef.current;
    if (!canvas) return 0;
    if (!grid) return canvas.height * 0.55;
    const cRect = canvas.getBoundingClientRect();
    const gRect = grid.getBoundingClientRect();
    if (cRect.height <= 0) return canvas.height * 0.55;
    const scaleY = canvas.height / cRect.height;
    return Math.max(0, (gRect.top - cRect.top) * scaleY);
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
      // No cast clip — jump straight to impact/reveal pipeline
      staffHitRef.current = true;
      waitingImpactRef.current = true;
      callbacksRef.current.onStaffHit();
      return;
    }
    castingRef.current = true;
    castDoneRef.current = false;
    staffHitRef.current = false;
    waitingImpactRef.current = false;
    videoSeekingRef.current = false;
    idle?.pause();
    cast.loop = false;
    cast.currentTime = 0;
    activeVideoRef.current = cast;

    let hitHandled = false;
    const cutAt = CAST_STAFF_HIT_SEC + CAST_AFTER_HIT_HOLD_SEC;

    const handleStaffHit = () => {
      if (hitHandled) return;
      hitHandled = true;
      staffHitRef.current = true;
      cast.removeEventListener('ended', onEnded);
      cast.removeEventListener('timeupdate', onTimeUpdate);
      cast.pause();
      castingRef.current = false;
      if (idle) {
        activeVideoRef.current = idle;
        idle.play().catch(() => {});
      }
      // Hold reveals until impact overlay finishes
      waitingImpactRef.current = true;
      castDoneRef.current = false;
      callbacksRef.current.onStaffHit();
    };

    const onTimeUpdate = () => {
      if (cast.currentTime >= cutAt) handleStaffHit();
    };

    const onEnded = () => {
      // Fallback if staff-hit timestamp was missed
      handleStaffHit();
    };

    cast.addEventListener('timeupdate', onTimeUpdate);
    cast.addEventListener('ended', onEnded);
    cast.play().catch(() => {
      handleStaffHit();
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
      staffHitRef.current = false;
      waitingImpactRef.current = false;
      return;
    }
    if (lastDrawIdRef.current === activeDraw.id && runningRef.current) return;
    lastDrawIdRef.current = activeDraw.id;
    queueRef.current = [...activeDraw.numbers];
    runningRef.current = true;
    finishedRef.current = false;
    castDoneRef.current = false;
    staffHitRef.current = false;
    waitingImpactRef.current = false;
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

      const wrapEl = wrapRef.current;
      const wrapW = wrapEl?.clientWidth ?? canvas.width;
      const portrait = wrapW < 860;

      let mageW: number;
      let mageH: number;
      let mageX: number;
      let mageY: number;

      if (portrait) {
        // Fill all space above the number grid — no dead gap
        const gridTop = getGridTop();
        const bandH = Math.max(gridTop - 6, canvas.height * 0.45);
        const boxW = canvas.width * 0.99;
        const boxH = bandH * 0.99;
        const scale =
          srcW > 0 && srcH > 0 ? Math.min(boxW / srcW, boxH / srcH) : 1;
        mageW = srcW > 0 ? srcW * scale : boxW;
        mageH = srcH > 0 ? srcH * scale : boxH;
        mageX = (canvas.width - mageW) / 2;
        mageY = Math.max(0, bandH - mageH);
      } else {
        // Desktop: large mage on the left edge of the frame
        const boxW = canvas.width * 0.42;
        const boxH = canvas.height * 0.98;
        const scale =
          srcW > 0 && srcH > 0 ? Math.min(boxW / srcW, boxH / srcH) : 1;
        mageW = srcW > 0 ? srcW * scale : boxW;
        mageH = srcH > 0 ? srcH * scale : boxH;
        mageX = canvas.width * 0.012;
        const gridBottom = getGridBottom();
        mageY = Math.max(4, (gridBottom || canvas.height * 0.98) - mageH);
      }

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

      // Staff-hit + hold fallback if timeupdate is sparse
      if (castingRef.current && !staffHitRef.current) {
        const cast = castVideoRef.current;
        const idle = idleVideoRef.current;
        const cutAt = CAST_STAFF_HIT_SEC + CAST_AFTER_HIT_HOLD_SEC;
        const nearEnd =
          cast &&
          Number.isFinite(cast.duration) &&
          cast.duration > 0 &&
          cast.currentTime >= cast.duration - 0.05;
        const hitNow = cast && cast.currentTime >= cutAt;
        if (hitNow || nearEnd) {
          staffHitRef.current = true;
          cast.pause();
          castingRef.current = false;
          if (idle) {
            activeVideoRef.current = idle;
            idle.play().catch(() => {});
          }
          waitingImpactRef.current = true;
          castDoneRef.current = false;
          callbacksRef.current.onStaffHit();
        }
      }

      // Impact overlay finished while we were waiting
      if (
        waitingImpactRef.current &&
        impactCompleteRef.current &&
        !castDoneRef.current
      ) {
        waitingImpactRef.current = false;
        castDoneRef.current = true;
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
