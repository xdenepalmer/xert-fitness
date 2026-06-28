import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

/**
 * A thin brand accent line that draws itself horizontally on scroll.
 */
export default function AnimatedLine({ className = '', vertical = false, color = '#7BA7BC', delay = 0 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{
        backgroundColor: color,
        transformOrigin: vertical ? 'top' : 'left',
      }}
      initial={vertical ? { scaleY: 0 } : { scaleX: 0 }}
      animate={inView ? (vertical ? { scaleY: 1 } : { scaleX: 1 }) : {}}
      transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}