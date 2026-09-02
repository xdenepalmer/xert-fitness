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
        backgroundColor: 'rgba(123,167,188,0.08)',
        border: '1px solid rgba(123,167,188,0.12)',
        ...style,
      }}
    />
  );
}
