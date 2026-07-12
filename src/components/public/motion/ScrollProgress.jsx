import React, { useEffect, useState } from 'react';

/**
 * Fixed top scroll-progress bar — architectural detail tying the page together.
 */
export default function ScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const maximum = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(maximum > 0 ? Math.min(1, Math.max(0, window.scrollY / maximum)) : 0);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 h-[3px] origin-left will-change-transform"
      style={{
        transform: `scaleX(${progress})`,
        background: 'linear-gradient(90deg, #32485A, #7BA7BC 50%, #D1DDE6)',
      }}
    />
  );
}
