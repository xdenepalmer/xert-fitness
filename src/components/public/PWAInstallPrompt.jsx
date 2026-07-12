import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

    const handler = (e) => {
      e.preventDefault();
      setDeferred(e);
      setTimeout(() => setVisible(true), 2500);
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
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          className="fixed bottom-0 left-0 right-0 z-[60] p-4 sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm"
        >
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
              className="shrink-0 px-4 py-2 font-display text-sm uppercase"
              style={{ backgroundColor: '#7BA7BC', color: '#101820' }}
            >
              Add
            </button>
            <button onClick={dismiss} className="shrink-0 p-1" aria-label="Dismiss">
              <X className="w-4 h-4" style={{ color: 'rgba(209,221,230,0.5)' }} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
