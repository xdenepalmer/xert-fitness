import React, { useState, useEffect } from 'react';

export default function StickyMobileCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handle = () => setVisible(window.scrollY > 400);
    window.addEventListener('scroll', handle, { passive: true });
    return () => window.removeEventListener('scroll', handle);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden px-4 py-3"
      style={{ backgroundColor: 'rgba(16,24,32,0.97)', borderTop: '1px solid rgba(123,167,188,0.2)', backdropFilter: 'blur(8px)' }}>
      <a href="#eoi"
        className="block w-full text-center py-3.5 font-display text-base uppercase tracking-wide transition-all"
        style={{ backgroundColor: '#7BA7BC', color: '#101820' }}>
        Register Foundation Interest
      </a>
    </div>
  );
}