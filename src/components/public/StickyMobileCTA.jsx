import React, { useState, useEffect } from 'react';

export default function StickyMobileCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-xert-black/95 border-t border-xert-steel/30 px-4 py-3 backdrop-blur-sm">
      <a href="#eoi"
        className="block w-full text-center py-3.5 bg-xert-red text-white font-display text-base uppercase tracking-wide hover:bg-xert-orange transition-colors">
        Register Foundation Interest
      </a>
    </div>
  );
}