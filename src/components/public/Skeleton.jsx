import React from 'react';

/**
 * Branded loading placeholder: steel-tinted pulse on ink with the same soft
 * radius as the card system. Size it with className (h-*, w-*, aspect-*)
 * exactly like a div; pass any rounded-* class to override the default radius.
 */
export default function Skeleton({ className = '', style = {} }) {
  const radius = /\brounded(-|\b)/.test(className) ? '' : 'rounded-lg';
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse ${radius} ${className}`}
      style={{
        backgroundColor: 'var(--accent-default-8)',
        border: '1px solid var(--accent-default-12)',
        ...style,
      }}
    />
  );
}
