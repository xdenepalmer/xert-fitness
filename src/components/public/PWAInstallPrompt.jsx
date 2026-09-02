import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

/**
 * Mobile-first PWA install prompt. Captures the beforeinstallprompt
 * event and surfaces a branded bottom-sheet CTA. Dismissal is remembered.
 */
export default function PWAInstallPrompt({ context = 'member' }) {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const dismissalKey = context === 'owner' ? 'xert_pwa_owner_dismissed' : 'xert_pwa_dismissed';

  useEffect(() => {
    const iosNavigator = /** @type {Navigator & { standalone?: boolean }} */ (window.navigator);
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || iosNavigator.standalone;
    if (standalone) return;
    if (localStorage.getItem(dismissalKey) === '1') return;

    let revealTimer = 0;
    const isiOS = /iPad|iPhone|iPod/i.test(window.navigator.userAgent)
      || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
    if (isiOS) {
      setShowIosInstructions(true);
      revealTimer = window.setTimeout(() => setVisible(true), 2500);
    }
    const handler = (e) => {
      e.preventDefault();
      setDeferred(e);
      setShowIosInstructions(false);
      if (revealTimer) window.clearTimeout(revealTimer);
      revealTimer = window.setTimeout(() => setVisible(true), 2500);
    };
    window.addEventListener('beforeinstallprompt', handler);
    const installed = () => {
      localStorage.setItem(dismissalKey, '1');
      setDeferred(null);
      setVisible(false);
    };
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
      if (revealTimer) window.clearTimeout(revealTimer);
    };
  }, [context, dismissalKey]);

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === 'accepted') localStorage.setItem(dismissalKey, '1');
    setDeferred(null);
    setVisible(false);
  };

  const dismiss = () => {
    localStorage.setItem(dismissalKey, '1');
    setVisible(false);
  };

  return (
    visible ? (
        // Below md the StickyMobileCTA floats at the bottom edge, so the sheet
        // sits above its height (incl. safe area) instead of overlapping it.
        <div className={`xert-sheet-enter fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-0 right-0 px-4 sm:left-auto sm:right-4 sm:max-w-sm sm:px-0 md:bottom-4 ${context === 'owner' ? 'z-[45]' : 'z-[60]'}`}>
          <div
            className="xert-glass flex items-center gap-3 rounded-2xl p-3 shadow-[0_20px_50px_-18px_rgba(0,0,0,0.85)] sm:gap-4 sm:p-4"
            style={{ backgroundColor: 'rgba(16,24,32,0.94)' }}
          >
            <div className="xert-icon-tile" style={{ backgroundColor: '#7BA7BC', color: '#101820' }}>
              <Download className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-base uppercase leading-none text-xert-offwhite">
                {context === 'owner' ? 'Install Command Centre' : 'Install XERT'}
              </p>
              <p className="mt-1 font-body text-xs text-xert-pale/60">
                {showIosInstructions
                  ? 'Tap Share, then Add to Home Screen for one-tap access.'
                  : context === 'owner'
                    ? 'Open owner tools from your home screen.'
                    : 'Add to your home screen for quick access.'}
              </p>
            </div>
            {!showIosInstructions && (
              <button
                onClick={install}
                className="xert-btn-primary min-h-11 shrink-0 px-4 py-3 font-display text-sm uppercase"
              >
                Add
              </button>
            )}
            <button
              onClick={dismiss}
              className="-my-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              aria-label="Dismiss install prompt"
            >
              <X className="w-4 h-4 text-xert-pale/70" aria-hidden="true" />
            </button>
          </div>
        </div>
    ) : null
  );
}
