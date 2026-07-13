import React from 'react';

/**
 * Branded loading placeholder: steel-tinted pulse on ink, sharp corners.
 * Size it with className (h-*, w-*, aspect-*) exactly like a div.
 */
export default function Skeleton({ className = '', style = {} }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse ${className}`}
      style={{
        backgroundColor: 'rgba(123,167,188,0.08)',
        border: '1px solid rgba(123,167,188,0.12)',
        ...style,
      }}
    />
  );
}
