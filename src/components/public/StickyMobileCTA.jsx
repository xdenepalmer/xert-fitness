import React, { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function StickyMobileCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handle = () => setVisible(window.scrollY > 400);
    window.addEventListener('scroll', handle, { passive: true });
    return () => window.removeEventListener('scroll', handle);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed bottom-0 left-0 right-0 z-40 md:hidden px-4 pt-3"
          style={{
            backgroundColor: 'rgba(16,24,32,0.97)',
            borderTop: '1px solid rgba(123,167,188,0.2)',
            backdropFilter: 'blur(10px)',
            paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
          }}
        >
          <a href="/booking"
            className="flex items-center justify-center gap-2 w-full text-center py-3.5 font-display text-base uppercase tracking-wide transition-transform active:scale-[0.98]"
            style={{ backgroundColor: '#7BA7BC', color: '#101820' }}>
            Book Your First Session
            <ArrowRight className="w-4 h-4" />
          </a>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
