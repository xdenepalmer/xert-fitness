import React from 'react';

/**
 * Architectural blueprint grid + corner ticks. Sits behind a section
 * to add structural depth without competing with content.
 */
export default function GridBackdrop({ opacity = 0.5 }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ opacity }}>
      {/* Fine grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(123,167,188,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(123,167,188,0.06) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
        }}
      />
      {/* Corner ticks */}
      {[
        'top-6 left-6 border-t border-l',
        'top-6 right-6 border-t border-r',
        'bottom-6 left-6 border-b border-l',
        'bottom-6 right-6 border-b border-r',
      ].map((pos, i) => (
        <div key={i} className={`absolute w-6 h-6 ${pos}`} style={{ borderColor: 'rgba(123,167,188,0.3)' }} />
      ))}
    </div>
  );
}