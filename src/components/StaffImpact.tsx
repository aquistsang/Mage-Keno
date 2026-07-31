import { useEffect, useRef } from 'react';

const IMPACT_WEBM = './assets/staff-impact.webm';
const IMPACT_MP4 = './assets/staff-impact.mp4';

type Props = {
  active: boolean;
  onEnded: () => void;
};

/** Full-bleed firestorm clip that covers the number grid after the staff hit. */
export function StaffImpact({ active, onEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const endedRef = useRef(false);

  useEffect(() => {
    if (!active) {
      endedRef.current = false;
      const v = videoRef.current;
      if (v) {
        v.pause();
        v.currentTime = 0;
      }
      return;
    }

    endedRef.current = false;
    const video = videoRef.current;
    if (!video) return;

    const finish = () => {
      if (endedRef.current) return;
      endedRef.current = true;
      onEnded();
    };

    video.currentTime = 0;
    video.play().catch(() => finish());

    return () => {
      video.pause();
    };
  }, [active, onEnded]);

  if (!active) return null;

  return (
    <div className="staff-impact" aria-hidden="true">
      <video
        ref={videoRef}
        className="staff-impact-video"
        muted
        playsInline
        preload="auto"
        onEnded={() => {
          if (endedRef.current) return;
          endedRef.current = true;
          onEnded();
        }}
        onError={() => {
          if (endedRef.current) return;
          endedRef.current = true;
          onEnded();
        }}
      >
        <source src={IMPACT_WEBM} type="video/webm" />
        <source src={IMPACT_MP4} type="video/mp4" />
      </video>
    </div>
  );
}
