import React, { useLayoutEffect, useRef } from 'react';
import NavLink from './NavLink';

// Public pages own their nav instances. Keep the last visible indicator geometry
// across a route remount so the fallback still slides instead of appearing anew.
let previousIndicator = null;

export default function DesktopLinks({ links, pathname, signedIn, visible }) {
  const groupRef = useRef(null);
  const indicatorRef = useRef(null);
  useLayoutEffect(() => {
    const group = groupRef.current;
    const indicator = indicatorRef.current;
    const measure = () => {
      const active = group.querySelector('[aria-current="page"]');
      if (!visible || !active || !group.getBoundingClientRect().width) {
        indicator.style.opacity = '0';
        return;
      }
      const parentRect = group.getBoundingClientRect();
      const rect = active.getBoundingClientRect();
      const next = { x: rect.left - parentRect.left, width: rect.width };
      const previous = previousIndicator;
      indicator.style.setProperty('--indicator-x', `${next.x}px`);
      indicator.style.setProperty('--indicator-width', `${next.width}px`);
      indicator.style.opacity = '1';
      if (previous && (Math.abs(previous.x - next.x) > .5 || Math.abs(previous.width - next.width) > .5)
        && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        indicator.getAnimations().forEach(animation => animation.cancel());
        indicator.animate([
          { transform: `translateX(${previous.x - next.x}px) scaleX(${previous.width / next.width})` },
          { transform: 'translateX(0) scaleX(1)' },
        ], { duration: parseFloat(getComputedStyle(group).getPropertyValue('--duration-standard')) || 0, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
      previousIndicator = next;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(group);
    group.querySelectorAll('a').forEach(link => observer.observe(link));
    return () => observer.disconnect();
  }, [pathname, visible]);

  return <div className="public-nav-desktop" aria-hidden={!visible}>
    <div ref={groupRef} data-nav-links className="public-nav-links">
      {links.map(link => <NavLink key={link.to || link.href} {...link}
        aria-current={link.to === pathname ? 'page' : undefined} className="public-nav-link">{link.label}</NavLink>)}
      <span ref={indicatorRef} data-nav-indicator aria-hidden="true" className="public-nav-indicator" />
    </div>
    <div className="public-nav-actions">
      <NavLink to={signedIn ? '/account' : '/login'} className="public-nav-account">{signedIn ? 'Account' : 'Log In'}</NavLink>
      <NavLink to="/booking" className="public-nav-book">Book Now</NavLink>
    </div>
  </div>;
}
