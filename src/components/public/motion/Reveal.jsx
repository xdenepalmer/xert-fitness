import React, { useRef, useEffect, useState } from 'react';
import { motion, useInView } from 'framer-motion';

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
  const inView = useInView(ref, { once, margin: '-8% 0px -8% 0px' });
  const [forceShow, setForceShow] = useState(false);

  // Fail-safe: if for any reason the element never registers as in-view
  // (e.g. layout/observer quirks), reveal it so content is never lost.
  useEffect(() => {
    const t = setTimeout(() => setForceShow(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const show = inView || forceShow;

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y, x }}
      animate={show ? { opacity: 1, y: 0, x: 0 } : { opacity: 0, y, x }}
      transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}