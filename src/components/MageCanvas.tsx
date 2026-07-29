import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { easeOutCubic, lerp } from '../utils/easing';
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

type Fireball = {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  t: number;
  duration: number;
  number: number;
  done: boolean;
};

/** Pre-keyed WebM (green screen → alpha). Preferred. */
const MAGE_WEBM_SRC = './assets/mage.webm';
/** Raw green-screen MP4 — runtime chroma key if WebM fails. */
const MAGE_MP4_SRC = './assets/mage.mp4';
/** Fallback still if video fails to load. */
const MAGE_IMG_SRC = './assets/mage.png';

export function MageCanvas({
  gridRef,
  selected,
  activeDraw,
  onFireballImpact,
  onSequenceComplete,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const mageVideoRef = useRef<HTMLVideoElement | null>(null);
  const mageImgRef = useRef<HTMLImageElement | null>(null);
  const chromaOffscreenRef = useRef<HTMLCanvasElement | null>(null);
  const lastMageFrameRef = useRef<HTMLCanvasElement | null>(null);
  const videoSeekingRef = useRef(false);
  const particlesRef = useRef<Particle[]>([]);
  const fireballRef = useRef<Fireball | null>(null);
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

    const video = document.createElement('video');
    video.src = `${MAGE_MP4_SRC}?v=loop2`;
    video.muted = true;
    // Manual seamless loop — HTML loop=true often flashes a blank/keyframe frame
    video.loop = false;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    // Wrap within ~1 frame of the end → start (avoids cutting visible motion)
    const LOOP_IN = 0.001;
    const LOOP_OUT_PAD = 1 / 24;

    const tryPlay = () => {
      video.play().catch(() => {});
    };

    const wrapLoop = () => {
      if (!Number.isFinite(video.duration) || video.duration <= LOOP_OUT_PAD * 2) return;
      if (video.seeking) return;
      if (video.currentTime >= video.duration - LOOP_OUT_PAD) {
        videoSeekingRef.current = true;
        try {
          video.currentTime = LOOP_IN;
        } catch {
          /* ignore seek race */
        }
      }
    };

    // High-frequency loop check (timeupdate alone is too coarse and causes a visible skip)
    let loopRaf = 0;
    const loopTick = () => {
      wrapLoop();
      loopRaf = requestAnimationFrame(loopTick);
    };

    video.addEventListener('loadeddata', () => {
      mageVideoRef.current = video;
      tryPlay();
      cancelAnimationFrame(loopRaf);
      loopRaf = requestAnimationFrame(loopTick);
    });
    video.addEventListener('ended', () => {
      videoSeekingRef.current = true;
      video.currentTime = LOOP_IN;
      tryPlay();
    });
    video.addEventListener('seeking', () => {
      videoSeekingRef.current = true;
    });
    video.addEventListener('seeked', () => {
      // Keep holding last frame for one more paint, then resume live video
      requestAnimationFrame(() => {
        videoSeekingRef.current = false;
        tryPlay();
      });
    });
    video.addEventListener('error', () => {
      if (video.src.includes('mage.mp4')) {
        video.src = MAGE_WEBM_SRC;
        video.load();
        return;
      }
      console.warn('[Mage Keno] mage video failed — falling back to mage.png');
      mageVideoRef.current = null;
    });
    video.load();

    const img = new Image();
    img.src = MAGE_IMG_SRC;
    img.onload = () => {
      mageImgRef.current = img;
    };

    const unlock = () => {
      tryPlay();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      cancelAnimationFrame(loopRaf);
      video.pause();
      video.removeAttribute('src');
      video.load();
      mageVideoRef.current = null;
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

  const getMageStaffPoint = (): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 80, y: 200 };
    // Staff sits in upper-mid of the mage after feet are pinned to grid bottom
    const bottom = getGridBottom();
    return { x: canvas.width * 0.2, y: Math.max(canvas.height * 0.22, bottom - canvas.height * 0.42) };
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
    fireballRef.current = null;
    particlesRef.current = [];
  }, [activeDraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const completeOnce = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      runningRef.current = false;
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
    let launchTimer: number | null = null;

    const launchNext = () => {
      const next = queueRef.current.shift();
      if (next == null) {
        completeOnce();
        return;
      }
      const from = getMageStaffPoint();
      const to = getBallCenter(next) ?? { x: canvas.width * 0.6, y: canvas.height * 0.5 };
      fireballRef.current = {
        x: from.x,
        y: from.y,
        fromX: from.x,
        fromY: from.y,
        toX: to.x,
        toY: to.y,
        t: 0,
        duration: 420 + Math.random() * 80,
        number: next,
        done: false,
      };
    };

    const drawMage = (ctx: CanvasRenderingContext2D) => {
      const video = mageVideoRef.current;
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
        if (video.paused) video.play().catch(() => {});
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
      // Pin feet to the bottom of the last keno row
      const gridBottom = getGridBottom();
      const mageY = Math.max(8, (gridBottom || canvas.height * 0.92) - mageH);

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
            keyR: 25,
            keyG: 225,
            keyB: 13,
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
      } else {
        ctx.fillStyle = 'rgba(120, 80, 200, 0.55)';
        ctx.beginPath();
        ctx.ellipse(
          mageX + mageW * 0.5,
          mageY + mageH * 0.55,
          mageW * 0.28,
          mageH * 0.42,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.fillStyle = '#c9a44a';
        ctx.font = `bold ${Math.floor(canvas.width * 0.018)}px Orbitron, sans-serif`;
        ctx.fillText('MAGE', mageX + mageW * 0.22, mageY + mageH * 0.95);
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

      if (runningRef.current && !fireballRef.current && queueRef.current.length > 0 && launchTimer == null) {
        launchNext();
      }

      const fb = fireballRef.current;
      if (fb && !fb.done) {
        fb.t += dt;
        const u = Math.min(1, fb.t / fb.duration);
        const e = easeOutCubic(u);
        const arc = Math.sin(u * Math.PI) * (canvas.height * 0.06);
        fb.x = lerp(fb.fromX, fb.toX, e);
        fb.y = lerp(fb.fromY, fb.toY, e) - arc;

        const r = 10 + Math.sin(now / 40) * 2;
        const grd = ctx.createRadialGradient(fb.x, fb.y, 0, fb.x, fb.y, r * 2.4);
        grd.addColorStop(0, '#fff6c8');
        grd.addColorStop(0.35, '#ff9a1a');
        grd.addColorStop(1, 'rgba(255, 60, 0, 0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(fb.x, fb.y, r * 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffe566';
        ctx.beginPath();
        ctx.arc(fb.x, fb.y, r * 0.55, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 140, 40, 0.55)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(fb.fromX, fb.fromY);
        ctx.quadraticCurveTo(
          (fb.fromX + fb.x) / 2,
          Math.min(fb.fromY, fb.y) - arc * 1.4,
          fb.x,
          fb.y,
        );
        ctx.stroke();

        if (u >= 1) {
          fb.done = true;
          const hit = selectedRef.current.has(fb.number);
          callbacksRef.current.onFireballImpact(fb.number);
          if (hit) {
            particlesRef.current.push(...spawnExplosion(fb.toX, fb.toY, 34));
            flashRef.current = 180;
          } else {
            particlesRef.current.push(
              ...spawnExplosion(fb.toX, fb.toY, 10).map((p) => ({
                ...p,
                color: '#ff5a6a',
                vx: p.vx * 0.45,
                vy: p.vy * 0.45,
              })),
            );
          }
          fireballRef.current = null;
          launchTimer = window.setTimeout(() => {
            launchTimer = null;
            if (queueRef.current.length > 0) launchNext();
            else if (particlesRef.current.length === 0) completeOnce();
          }, hit ? 220 : 120);
        }
      }

      updateParticles(particlesRef.current, dt);
      drawParticles(ctx, particlesRef.current);

      if (
        runningRef.current &&
        !fireballRef.current &&
        launchTimer == null &&
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
      if (launchTimer != null) window.clearTimeout(launchTimer);
      ro.disconnect();
    };
  }, [gridRef]);

  return (
    <div ref={wrapRef} className="mage-canvas-wrap" aria-hidden="true">
      <canvas ref={canvasRef} className="mage-canvas" />
    </div>
  );
}
