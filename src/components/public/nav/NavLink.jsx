import React from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { shouldTransition } from './navState';

export default function NavLink({ to, href, onClick, children, ...props }) {
  const navigate = useNavigate();
  if (href) return <a href={href} onClick={onClick} {...props}>{children}</a>;
  const handleClick = event => {
    const transition = shouldTransition(event, to) && (!props.target || props.target === '_self')
      && document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    onClick?.(event);
    if (!transition || event.defaultPrevented) return;
    event.preventDefault();
    const animation = document.startViewTransition(() => flushSync(() => navigate(to)));
    // A second route click can skip an in-flight transition; routing still wins.
    animation.finished.catch(() => {});
  };
  return <Link to={to} onClick={handleClick} {...props}>{children}</Link>;
}
