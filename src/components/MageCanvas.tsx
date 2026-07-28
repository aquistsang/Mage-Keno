import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { easeOutCubic, lerp } from '../utils/easing';
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

/** Swap `public/assets/mage.png` to change the mage sprite. */
const MAGE_SRC = './assets/mage.png';

export function MageCanvas({
  gridRef,
  selected,
  activeDraw,
  onFireballImpact,
  onSequenceComplete,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const mageImgRef = useRef<HTMLImageElement | null>(null);
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
    const img = new Image();
    img.src = MAGE_SRC;
    img.onload = () => {
      mageImgRef.current = img;
    };
    img.onerror = () => {
      console.warn('[Mage Keno] Replace public/assets/mage.png with your mage sprite.');
      mageImgRef.current = null;
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

  const getMageStaffPoint = (): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 80, y: 200 };
    return { x: canvas.width * 0.14, y: canvas.height * 0.42 };
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

    const tick = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        raf = requestAnimationFrame(tick);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const mage = mageImgRef.current;
      const mageW = canvas.width * 0.22;
      const mageH = mageW * 1.35;
      const mageX = canvas.width * 0.01;
      const mageY = canvas.height * 0.55 - mageH / 2;
      if (mage) {
        ctx.drawImage(mage, mageX, mageY, mageW, mageH);
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
