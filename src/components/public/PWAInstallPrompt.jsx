import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

/**
 * Mobile-first PWA install prompt. Captures the beforeinstallprompt
 * event and surfaces a branded bottom-sheet CTA. Dismissal is remembered.
 */
export default function PWAInstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const iosNavigator = /** @type {Navigator & { standalone?: boolean }} */ (window.navigator);
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || iosNavigator.standalone;
    if (standalone) return;
    if (localStorage.getItem('xert_pwa_dismissed') === '1') return;

    let revealTimer = 0;
    const handler = (e) => {
      e.preventDefault();
      setDeferred(e);
      revealTimer = window.setTimeout(() => setVisible(true), 2500);
    };
    window.addEventListener('beforeinstallprompt', handler);
    const installed = () => {
      localStorage.setItem('xert_pwa_dismissed', '1');
      setDeferred(null);
      setVisible(false);
    };
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
      if (revealTimer) window.clearTimeout(revealTimer);
    };
  }, []);

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === 'accepted') localStorage.setItem('xert_pwa_dismissed', '1');
    setDeferred(null);
    setVisible(false);
  };

  const dismiss = () => {
    localStorage.setItem('xert_pwa_dismissed', '1');
    setVisible(false);
  };

  return (
    visible ? (
        // Below md the StickyMobileCTA docks to the bottom edge, so the sheet
        // sits above its height (incl. safe area) instead of overlapping it.
        <div className="xert-sheet-enter fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-0 right-0 z-[60] p-4 sm:left-auto sm:right-4 sm:max-w-sm md:bottom-4">
          <div
            className="flex items-center gap-4 p-4 border"
            style={{
              backgroundColor: 'rgba(16,24,32,0.96)',
              borderColor: 'rgba(123,167,188,0.35)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div
              className="shrink-0 w-11 h-11 flex items-center justify-center"
              style={{ backgroundColor: '#7BA7BC' }}
            >
              <Download className="w-5 h-5" style={{ color: '#101820' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-base uppercase leading-none text-xert-offwhite">Install XERT</p>
              <p className="font-body text-xs mt-1" style={{ color: 'rgba(209,221,230,0.6)' }}>
                Add to your home screen for quick access.
              </p>
            </div>
            <button
              onClick={install}
              className="xert-btn-primary shrink-0 px-4 py-3 font-display text-sm uppercase"
            >
              Add
            </button>
            <button
              onClick={dismiss}
              className="shrink-0 -my-2 -mr-2 flex h-11 w-11 items-center justify-center"
              aria-label="Dismiss install prompt"
            >
              <X className="w-4 h-4 text-xert-pale/70" aria-hidden="true" />
            </button>
          </div>
        </div>
    ) : null
  );
}
