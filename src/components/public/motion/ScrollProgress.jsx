import React from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';

/**
 * Fixed top scroll-progress bar — architectural detail tying the page together.
 */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 z-50 h-[3px] origin-left"
      style={{
        scaleX,
        background: 'linear-gradient(90deg, #32485A, #7BA7BC 50%, #D1DDE6)',
      }}
    />
  );
}