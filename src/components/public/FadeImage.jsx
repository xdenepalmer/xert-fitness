import React, { useState } from 'react';

/**
 * <img> that lazy-loads and fades in on decode instead of popping.
 * The global prefers-reduced-motion rule collapses the transition to 0.01ms,
 * so motion-sensitive users just see the image appear.
 */
export default function FadeImage({ className = '', style = {}, onLoad = undefined, onError = undefined, ...props }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      loading="lazy"
      decoding="async"
      {...props}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
      onError={(e) => {
        // Failed images must still become visible (alt text / broken-image UI)
        // instead of sitting at opacity 0 forever.
        setLoaded(true);
        onError?.(e);
      }}
      className={className}
      style={{
        opacity: loaded ? 1 : 0,
        transition: 'opacity 600ms cubic-bezier(0.22, 1, 0.36, 1)',
        ...style,
      }}
    />
  );
}
