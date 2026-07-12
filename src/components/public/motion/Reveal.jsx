import React, { useRef, useEffect, useState } from 'react';

/**
 * Scroll-triggered reveal. Wraps children and animates them in
 * once they enter the viewport. Includes a fail-safe so content
 * is never permanently hidden if the in-view event doesn't fire.
 */
export default function Reveal({
  children,
  delay = 0,
  y = 28,
  x = 0,
  once = true,
  className = '',
  duration = 0.7,
}) {
  const ref = useRef(null);
  const [show, setShow] = useState(false);

  // Fail-safe: if for any reason the element never registers as in-view
  // (e.g. layout/observer quirks), reveal it so content is never lost.
  useEffect(() => {
    const node = ref.current;
    if (!node || !('IntersectionObserver' in window)) {
      setShow(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShow(true);
        if (once) observer.disconnect();
      } else if (!once) setShow(false);
    }, { rootMargin: '-8% 0px -8% 0px' });
    observer.observe(node);
    const fallback = window.setTimeout(() => setShow(true), 1200);
    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, [once]);

  return (
    <div
      ref={ref}
      className={`xert-reveal ${className}`}
      style={{
        opacity: show ? 1 : 0,
        transform: show ? 'translate3d(0,0,0)' : `translate3d(${x}px,${y}px,0)`,
        transitionDuration: `${duration}s`,
        transitionDelay: `${delay}s`
      }}
    >
      {children}
    </div>
  );
}
