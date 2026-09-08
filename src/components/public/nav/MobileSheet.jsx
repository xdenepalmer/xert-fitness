import React, { useEffect, useRef } from 'react';
import NavLink from './NavLink';
import MenuInformation from './MenuInformation';

export default function MobileSheet({ links, pathname, user, profile, close, triggerRef }) {
  const sheetRef = useRef(null);
  const scrollRef = useRef(null);
  const closeRef = useRef(null);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const root = sheetRef.current;
      const focusables = Array.from(root.querySelectorAll('a[href], button:not([disabled])')).filter(el => el.offsetParent !== null);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if ((!e.shiftKey && document.activeElement === last) || !root.contains(document.activeElement)) { e.preventDefault(); first?.focus(); }
    };
    const mq = window.matchMedia('(min-width: 64rem)');
    const onChange = e => { if (e.matches) close(); };
    mq.addEventListener('change', onChange);
    window.addEventListener('keydown', onKeyDown);
    const trigger = triggerRef.current;
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
      mq.removeEventListener('change', onChange);
      if (trigger?.isConnected && trigger.offsetParent !== null) trigger.focus();
    };
  }, [close, triggerRef]);

  useEffect(() => {
    const sheet = sheetRef.current;
    const scroll = scrollRef.current;
    let gesture = null;
    let dragged = false;
    const start = e => {
      if (e.touches.length !== 1 || scroll.scrollTop > 0) { gesture = null; return; }
      gesture = { x: e.touches[0].clientX, y: e.touches[0].clientY, distance: 0, decided: false };
      dragged = false;
    };
    const move = e => {
      if (!gesture || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - gesture.y;
      const dx = e.touches[0].clientX - gesture.x;
      if (!gesture.decided && Math.max(Math.abs(dy), Math.abs(dx)) > 8) {
        if (dy < 0 || Math.abs(dx) > dy) { gesture = null; return; }
        gesture.decided = true;
      }
      if (!gesture.decided) return;
      e.preventDefault();
      dragged = true;
      gesture.distance = Math.max(0, dy);
      sheet.style.transition = 'none';
      sheet.style.transform = `translateY(${gesture.distance / (1 + gesture.distance / 600)}px)`;
    };
    const finish = () => {
      const dismiss = gesture?.distance > 100;
      gesture = null;
      sheet.style.removeProperty('transition');
      sheet.style.removeProperty('transform');
      if (dismiss) close();
    };
    const cancel = () => { gesture = null; finish(); };
    const suppressClick = e => { if (dragged) { e.preventDefault(); e.stopPropagation(); dragged = false; } };
    sheet.addEventListener('touchstart', start, { passive: true });
    sheet.addEventListener('touchmove', move, { passive: false });
    sheet.addEventListener('touchend', finish);
    sheet.addEventListener('touchcancel', cancel);
    sheet.addEventListener('click', suppressClick, true);
    return () => {
      sheet.removeEventListener('touchstart', start);
      sheet.removeEventListener('touchmove', move);
      sheet.removeEventListener('touchend', finish);
      sheet.removeEventListener('touchcancel', cancel);
      sheet.removeEventListener('click', suppressClick, true);
    };
  }, [close]);

  return <div ref={sheetRef} id="mobile-navigation" role="dialog" aria-modal="true" aria-label="Navigation menu" className="public-nav-sheet">
    <div className="public-menu-top"><span aria-hidden="true" className="public-menu-handle" /><button ref={closeRef} type="button" aria-label="Close navigation menu" onClick={close} className="public-menu-close min-w-11 min-h-11">Close <span aria-hidden="true">×</span></button></div>
    <div ref={scrollRef} data-nav-sheet-scroll className="public-menu-scroll">
      <div className="public-menu-links">
        {links.map((link, index) => <NavLink key={link.to || link.href} {...link} onClick={close} aria-current={link.to === pathname ? 'page' : undefined}
          className="public-menu-link" style={{ '--menu-order': index }}>{link.label}</NavLink>)}
      </div>
      <MenuInformation user={user} profile={profile} close={close} />
    </div>
    <div className="public-menu-footer"><NavLink to="/booking" onClick={close} className="public-nav-book">Book Now</NavLink></div>
  </div>;
}
