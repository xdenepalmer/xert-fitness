import React, {cloneElement, useEffect, useId, useRef} from 'react';
import {createPortal} from 'react-dom';

/** Native modal dialog supplies focus containment, Escape and inert background. */
export function AdminDrawer({open, onOpenChange, title, description = null, children, footer = null, trigger = null, role = 'dialog', closeLabel = 'Close drawer'}) {
  const dialog = useRef(null);
  const opener = useRef(null);
  const titleId = useId(), descriptionId = useId();
  useEffect(() => {
    const node = dialog.current;
    if (!open || !node) return;
    opener.current = document.activeElement;
    node.showModal();
    return () => {
      node.close();
      if (opener.current?.isConnected) opener.current.focus();
    };
  }, [open]);
  const triggerElement = trigger ? cloneElement(trigger, {onClick:event => {
    trigger.props.onClick?.(event);
    if (!event.defaultPrevented) onOpenChange(true);
  }}) : null;
  function containTab(event) {
    if (event.key !== 'Tab') return;
    const node = dialog.current;
    const targets = Array.from(node.querySelectorAll('button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]'))
      .filter(element => element.tabIndex >= 0 && !element.matches(':disabled, [hidden], [inert]') && !element.closest('[inert]') && element.getClientRects().length > 0);
    const first = targets[0], last = targets.at(-1);
    if (!first) {event.preventDefault(); node.focus(); return;}
    if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === node)) {
      event.preventDefault(); first.focus();
    }
  }
  return <>{triggerElement}{open && typeof document !== 'undefined' && createPortal(
    <dialog ref={dialog} role={role} className="admin-drawer" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}
      onKeyDown={containTab} onCancel={event => {event.preventDefault(); onOpenChange(false);}}>
      <div className="admin-drawer-close-region"><button type="button" className="admin-kit-button" aria-label={closeLabel} onClick={() => onOpenChange(false)}>Close</button></div>
      <div className="admin-drawer-content">
        <header className="admin-drawer-header"><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</header>
        <div className="admin-drawer-body">{children}</div>{footer && <footer className="admin-drawer-footer">{footer}</footer>}
      </div>
    </dialog>, document.body)}</>;
}
