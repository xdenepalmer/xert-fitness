import { useEffect } from 'react';

const DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"]';
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function visibleFocusableElements(dialog) {
  return Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter(element => element.getAttribute('aria-hidden') !== 'true' && !element.closest('[inert]'));
}

// A Radix AlertDialog portals its content to document.body — outside the
// workspace — and runs its own focus scope. When focus has left the workspace
// entirely we must yield the Tab cycle to that scope; otherwise this layer
// keeps yanking focus back into the workspace dialog and the portalled dialog's
// action button can never be reached by keyboard.
export function shouldManageDialogTab(workspace, activeElement) {
  return Boolean(workspace) && Boolean(activeElement) && workspace.contains(activeElement);
}

/**
 * Gives the command centre's hand-built dialogs one consistent modal boundary.
 * Radix dialogs render outside the workspace root and keep their own focus manager.
 */
export function useAdminDialogLayer(workspaceRef) {
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return undefined;

    let activeDialog = null;
    let restoreFocus = null;
    let previousOverflow = '';
    let focusFrame = 0;

    const focusDialog = dialog => {
      window.cancelAnimationFrame(focusFrame);
      focusFrame = window.requestAnimationFrame(() => {
        if (!dialog.isConnected || dialog.contains(document.activeElement)) return;
        const target = visibleFocusableElements(dialog)[0] || dialog;
        if (target === dialog && !dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
        target.focus();
      });
    };

    const releaseDialog = () => {
      activeDialog = null;
      document.body.style.overflow = previousOverflow;
      const target = restoreFocus;
      restoreFocus = null;
      if (target?.isConnected) {
        window.cancelAnimationFrame(focusFrame);
        focusFrame = window.requestAnimationFrame(() => target.focus());
      }
    };

    const syncDialog = () => {
      const dialogs = Array.from(workspace.querySelectorAll(DIALOG_SELECTOR))
        .filter(dialog => !dialog.hidden && dialog.getAttribute('aria-hidden') !== 'true');
      const nextDialog = dialogs.at(-1) || null;
      if (nextDialog === activeDialog) return;

      if (!nextDialog) {
        if (activeDialog) releaseDialog();
        return;
      }

      if (!activeDialog) {
        restoreFocus = document.activeElement;
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
      }
      activeDialog = nextDialog;
      focusDialog(nextDialog);
    };

    const trapFocus = event => {
      if (event.key !== 'Tab' || !activeDialog) return;
      if (!shouldManageDialogTab(workspace, document.activeElement)) return;
      const focusable = visibleFocusableElements(activeDialog);
      if (!focusable.length) {
        event.preventDefault();
        activeDialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !activeDialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !activeDialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    const observer = new MutationObserver(syncDialog);
    observer.observe(workspace, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-hidden', 'hidden'] });
    document.addEventListener('keydown', trapFocus);
    syncDialog();

    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', trapFocus);
      window.cancelAnimationFrame(focusFrame);
      if (activeDialog) document.body.style.overflow = previousOverflow;
    };
  }, [workspaceRef]);
}
