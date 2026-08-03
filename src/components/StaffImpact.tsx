import { useEffect, useRef } from 'react';

const IMPACT_WEBM = './assets/staff-impact.webm';
const IMPACT_MP4 = './assets/staff-impact.mp4';
/** Play at 2× so wall-clock duration is half of the source clip. */
const IMPACT_PLAYBACK_RATE = 2;

type Props = {
  active: boolean;
};

/** Firestorm behind the mage — loops until the parent deactivates it. */
export function StaffImpact({ active }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Keep the clip decoded so the first active frame isn't a blank load
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.load();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!active) {
      video.loop = false;
      video.pause();
      try {
        video.currentTime = 0;
      } catch {
        /* ignore seek before ready */
      }
      video.playbackRate = 1;
      return;
    }

    const start = () => {
      video.loop = true;
      video.playbackRate = IMPACT_PLAYBACK_RATE;
      try {
        video.currentTime = 0;
      } catch {
        /* ignore */
      }
      video.play().catch(() => {});
    };

    if (video.readyState >= 2) start();
    else video.addEventListener('loadeddata', start, { once: true });

    return () => {
      video.removeEventListener('loadeddata', start);
      video.pause();
    };
  }, [active]);

  return (
    <div
      className={`staff-impact${active ? ' is-active' : ''}`}
      aria-hidden="true"
    >
      <video
        ref={videoRef}
        className="staff-impact-video"
        muted
        playsInline
        loop
        preload="auto"
      >
        <source src={IMPACT_WEBM} type="video/webm" />
        <source src={IMPACT_MP4} type="video/mp4" />
      </video>
    </div>
  );
}
