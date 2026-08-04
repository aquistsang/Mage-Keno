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
/** Spell cast ambience (audio only) under the cast animation */
const CAST_SPELL_SFX_SRC = './assets/cast-spell.mp3';
/** Goblin grunt when a pick is knocked out (hit) */
const GOBLIN_HIT_SFX_SRC = './assets/goblin-hit.mp3';

const REVEAL_INTERVAL_MS = 280;
/** Cast clip speed-up (1 = normal). */
const CAST_PLAYBACK_RATE = 2.55;
/** Drop this many seconds off the end of mage-cast before the firestorm. */
const CAST_TRIM_END_SEC = 0.8;
/** Source-time in mage-cast.mp4 when the staff hits the ground. */
const CAST_STAFF_HIT_SEC = 2.9;
/** Time in cast-spell.mp3 of the ground-impact transient. */
const CAST_SFX_GROUND_HIT_SEC = 1.46;
/** Fine nudge (sec): positive = delay SFX impact vs staff; negative = earlier. */
const CAST_SFX_SYNC_NUDGE_SEC = 0;

export function MageCanvas({
  gridRef,
  selected,
  activeDraw,
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
  const whooshRef = useRef<HTMLAudioElement | null>(null);
  const castSfxRef = useRef<HTMLAudioElement | null>(null);
  const castSfxDelayRef = useRef<number | null>(null);
  const goblinHitRef = useRef<HTMLAudioElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const queueRef = useRef<number[]>([]);
  const runningRef = useRef(false);
  const finishedRef = useRef(false);
  const selectedRef = useRef(selected);
  const flashRef = useRef(0);
  const lastDrawIdRef = useRef<number | null>(null);
  const callbacksRef = useRef({ onFireballImpact, onSequenceComplete, onStaffHit });

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    callbacksRef.current = { onFireballImpact, onSequenceComplete, onStaffHit };
  }, [onFireballImpact, onSequenceComplete, onStaffHit]);

  useEffect(() => {
    chromaOffscreenRef.current = document.createElement('canvas');
    lastMageFrameRef.current = document.createElement('canvas');

    const whoosh = new Audio(FIREBALL_WHOOSH_SRC);
    whoosh.preload = 'auto';
    whoosh.volume = 0.7;
    whooshRef.current = whoosh;

    const goblinHit = new Audio(GOBLIN_HIT_SFX_SRC);
    goblinHit.preload = 'auto';
    goblinHit.volume = 0.9;
    goblinHitRef.current = goblinHit;

    const castSfx = new Audio(CAST_SPELL_SFX_SRC);
    castSfx.preload = 'auto';
    castSfx.volume = 0.85;
    castSfxRef.current = castSfx;

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
      goblinHit.play().then(() => {
        goblinHit.pause();
        goblinHit.currentTime = 0;
      }).catch(() => {});
      castSfx.play().then(() => {
        castSfx.pause();
        castSfx.currentTime = 0;
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
      goblinHit.pause();
      goblinHitRef.current = null;
      castSfx.pause();
      castSfxRef.current = null;
      if (castSfxDelayRef.current != null) {
        window.clearTimeout(castSfxDelayRef.current);
        castSfxDelayRef.current = null;
      }
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

  /** Cloud platform top (deck) + horizontal center in canvas pixels. */
  const getCloudPlatform = (): { deckY: number; centerX: number; cloudH: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const cloud = canvas.parentElement?.querySelector('.mage-cloud') as HTMLElement | null;
    if (!cloud) return null;
    const cRect = canvas.getBoundingClientRect();
    const q = cloud.getBoundingClientRect();
    if (cRect.height <= 0 || q.height <= 0) return null;
    const scaleX = canvas.width / cRect.width;
    const scaleY = canvas.height / cRect.height;
    const cloudH = q.height * scaleY;
    // Feet bury into the cloud (~55% down) so the platform reads underfoot
    const deckY = (q.top - cRect.top) * scaleY + cloudH * 0.55;
    const centerX = (q.left + q.width / 2 - cRect.left) * scaleX;
    return { deckY, centerX, cloudH };
  };

  const startCastPlayback = () => {
    const idle = idleVideoRef.current;
    const cast = castVideoRef.current;
    if (!cast) {
      // No cast clip — jump straight to impact/reveal pipeline
      staffHitRef.current = true;
      castDoneRef.current = true;
      callbacksRef.current.onStaffHit();
      return;
    }
    castingRef.current = true;
    castDoneRef.current = false;
    staffHitRef.current = false;
    videoSeekingRef.current = false;
    idle?.pause();
    cast.loop = false;
    cast.playbackRate = CAST_PLAYBACK_RATE;
    cast.currentTime = 0;
    activeVideoRef.current = cast;

    // Spell SFX under the cast — offset so ground hit lines up with staff slam
    const castSfx = castSfxRef.current;
    if (castSfxDelayRef.current != null) {
      window.clearTimeout(castSfxDelayRef.current);
      castSfxDelayRef.current = null;
    }
    if (castSfx) {
      try {
        castSfx.pause();
      } catch {
        /* ignore */
      }
      const wallToStaffHit =
        CAST_STAFF_HIT_SEC / CAST_PLAYBACK_RATE + CAST_SFX_SYNC_NUDGE_SEC;
      const sfxAtCastStart = CAST_SFX_GROUND_HIT_SEC - wallToStaffHit;
      const startSfx = (fromSec: number) => {
        try {
          castSfx.currentTime = Math.max(0, fromSec);
        } catch {
          /* ignore */
        }
        castSfx.play().catch(() => {});
      };
      if (sfxAtCastStart >= 0) {
        // Skip early SFX so its impact lands when the staff hits
        startSfx(sfxAtCastStart);
      } else {
        // Staff hit is later than the SFX impact — delay audio start
        castSfxDelayRef.current = window.setTimeout(() => {
          castSfxDelayRef.current = null;
          startSfx(0);
        }, -sfxAtCastStart * 1000);
      }
    }

    let finished = false;

    const finishCast = () => {
      if (finished) return;
      finished = true;
      staffHitRef.current = true;
      cast.removeEventListener('ended', onEnded);
      cast.removeEventListener('timeupdate', onTimeUpdate);
      cast.pause();
      castingRef.current = false;
      // Resume idle under the firestorm so there's no frozen staff pose
      if (idle) {
        idle.playbackRate = 1;
        activeVideoRef.current = idle;
        idle.play().catch(() => {});
      }
      // Start rainstorm + number reveals together
      castDoneRef.current = true;
      callbacksRef.current.onStaffHit();
    };

    const onTimeUpdate = () => {
      // Cut the trailing beat, then start the firestorm immediately
      if (
        Number.isFinite(cast.duration) &&
        cast.duration > CAST_TRIM_END_SEC + 0.25 &&
        cast.currentTime >= cast.duration - CAST_TRIM_END_SEC
      ) {
        finishCast();
      }
    };

    const onEnded = () => {
      finishCast();
    };

    cast.addEventListener('timeupdate', onTimeUpdate);
    cast.addEventListener('ended', onEnded);
    cast.play().catch(() => {
      finishCast();
    });
  };

  const stopCastPlayback = () => {
    const idle = idleVideoRef.current;
    const cast = castVideoRef.current;
    castingRef.current = false;
    castDoneRef.current = true;
    cast?.pause();
    if (castSfxDelayRef.current != null) {
      window.clearTimeout(castSfxDelayRef.current);
      castSfxDelayRef.current = null;
    }
    const castSfx = castSfxRef.current;
    if (castSfx) {
      castSfx.pause();
      try {
        castSfx.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    if (idle) {
      idle.playbackRate = 1;
      activeVideoRef.current = idle;
      idle.play().catch(() => {});
    }
  };

  useEffect(() => {
    if (!activeDraw) {
      lastDrawIdRef.current = null;
      staffHitRef.current = false;
      return;
    }
    if (lastDrawIdRef.current === activeDraw.id && runningRef.current) return;
    lastDrawIdRef.current = activeDraw.id;
    queueRef.current = [...activeDraw.numbers];
    runningRef.current = true;
    finishedRef.current = false;
    castDoneRef.current = false;
    staffHitRef.current = false;
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

    const playGoblinHit = () => {
      const master = goblinHitRef.current;
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
      if (hit) playGoblinHit();
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
      const rootW = document.getElementById('root')?.clientWidth ?? wrapW;
      // Prefer the iframe/#root box — device width can lie inside TriBet.
      const portrait = Math.min(wrapW, rootW) < 860;
      const platform = getCloudPlatform();

      let mageW: number;
      let mageH: number;
      let mageX: number;
      let mageY: number;

      if (portrait) {
        // Mobile: mage in the sky band only — feet ABOVE the numbers, no overlap.
        const gridTop = getGridTop();
        const padTop = Math.max(6, canvas.height * 0.01);
        const gap = Math.max(20, canvas.height * 0.028);
        const footTarget = platform
          ? Math.min(platform.deckY, gridTop - gap)
          : Math.max(padTop + 80, gridTop - gap);
        const bandH = Math.max(80, footTarget - padTop);
        // Fit the band; sprite has transparent padding so a mild overshoot is OK
        // but never push feet past the board.
        const scaleBySky = srcH > 0 ? (bandH / srcH) * (platform ? 1.05 : 1.18) : 1;
        const scaleByWidth = srcW > 0 ? (canvas.width * 0.92) / srcW : 1;
        const scale = Math.min(scaleBySky, scaleByWidth);
        mageW = srcW > 0 ? srcW * scale : canvas.width;
        mageH = srcH > 0 ? srcH * scale : bandH;
        mageX = platform
          ? platform.centerX - mageW / 2
          : (canvas.width - mageW) / 2;
        mageY = footTarget - mageH;
        if (mageY < padTop) mageY = padTop;
        // If hat forced us up, shrink so feet still clear the board.
        if (mageY + mageH > footTarget && srcH > 0) {
          const maxH = footTarget - mageY;
          const s2 = maxH / srcH;
          mageW = srcW * s2;
          mageH = srcH * s2;
          mageX = platform
            ? platform.centerX - mageW / 2
            : (canvas.width - mageW) / 2;
          mageY = footTarget - mageH;
        }
      } else {
        // Desktop: mage in the left column, clear of the number board
        const colW = canvas.width * 0.44;
        const boxW = colW * (platform ? 0.78 : 0.95);
        const boxH = canvas.height * (platform ? 0.78 : 0.98);
        const scale =
          (srcW > 0 && srcH > 0 ? Math.min(boxW / srcW, boxH / srcH) : 1) *
          (platform ? 1.02 : 1.15);
        mageW = srcW > 0 ? srcW * scale : boxW;
        mageH = srcH > 0 ? srcH * scale : boxH;
        mageX = platform
          ? platform.centerX - mageW / 2
          : (colW - mageW) / 2;
        if (platform) {
          mageY = platform.deckY - mageH;
          if (mageY < 4) mageY = 4;
        } else {
          const gridBottom = getGridBottom();
          const cssH = wrapEl?.clientHeight || canvas.height;
          const pxPerCss = canvas.height / Math.max(1, cssH);
          const oneCm = (96 / 2.54) * pxPerCss;
          const lift =
            Math.max(48, canvas.height * 0.06) + canvas.height * 0.1 + oneCm;
          mageY = Math.max(4, (gridBottom || canvas.height * 0.98) - mageH - lift);
        }
        // Nudge away from the number board (desktop only)
        {
          const cssW = wrapEl?.clientWidth || canvas.width;
          const cssH = wrapEl?.clientHeight || canvas.height;
          const cmX = (96 / 2.54) * (canvas.width / Math.max(1, cssW));
          const cmY = (96 / 2.54) * (canvas.height / Math.max(1, cssH));
          mageX -= cmX; // 1cm left
          mageY -= cmY; // 1cm up
        }
      }

      // Cast clip is brighter green; idle uses similar key
      // Cast slam needs aggressive keying — green pockets around staff/fire
      const key = castingRef.current
        ? {
            keyR: 20,
            keyG: 220,
            keyB: 12,
            similarity: 0.58,
            blend: 0.04,
            despill: 0.92,
            expandPasses: 6,
            aggressive: true,
          }
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

      // Cast trimmed end — start firestorm + reveals together
      if (castingRef.current && !staffHitRef.current) {
        const cast = castVideoRef.current;
        const idle = idleVideoRef.current;
        const trimReady =
          cast &&
          Number.isFinite(cast.duration) &&
          cast.duration > CAST_TRIM_END_SEC + 0.25 &&
          cast.currentTime >= cast.duration - CAST_TRIM_END_SEC;
        if (trimReady || (cast && cast.ended)) {
          staffHitRef.current = true;
          cast.pause();
          castingRef.current = false;
          if (idle) {
            idle.playbackRate = 1;
            activeVideoRef.current = idle;
            idle.play().catch(() => {});
          }
          castDoneRef.current = true;
          callbacksRef.current.onStaffHit();
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
