import React, { useState, useEffect } from 'react';
import { toast } from '@/components/ui/use-toast';
import {
  activateSessionPackPayments,
  getCommerceConfigurationHealth,
  getSoftLaunchSettings,
  updateSoftLaunchSettings,
  getDefaultSettings,
  memberBookingSwitchGuardReady,
} from '@/lib/adminData';
import AdminLoadError from '@/components/admin/AdminLoadError';
import AdminConfirmDialog from '@/components/admin/AdminConfirmDialog';
import {
  launchSettingsChanged,
  livePaymentSettingsRequirePause,
  normalizeLaunchSettings,
  paymentActivationRequiresBookings,
  paymentActivationRequiresBookingsMessage,
  paymentSettingsPauseRequiredMessage,
} from '@/lib/launchSettings';

/** @param {boolean} _dirty */
const NOOP = _dirty => {};

export default function SoftLaunchSettings({ onDirtyChange = NOOP }) {
  const defaults = getDefaultSettings();
  const [settings, setSettings] = useState(defaults);
  const [savedSettings, setSavedSettings] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [pendingPaymentActivation, setPendingPaymentActivation] = useState(null);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const loadedSettings = await getSoftLaunchSettings();
      if (loadedSettings) {
        // Coerce the flag to a real boolean so the toggle shows its true default
        // (hidden) before the row/column has ever been written, and so the dirty
        // check does not compare a boolean against undefined.
        const normalized = { ...loadedSettings, prices_coming_soon: loadedSettings.prices_coming_soon !== false };
        setSettings(normalized);
        setSavedSettings(normalized);
      }
    } catch (error) {
      setLoadError(error.message || 'Check the admin settings table and admin permissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const dirty = launchSettingsChanged(settings, savedSettings);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const set = (k, v) => {
    setSaved(false);
    setSettings(p => ({ ...p, [k]: v }));
  };

  const persistSettings = async (normalized, activatePayments = false) => {
    setSaving(true);
    try {
      const updated = activatePayments
        ? await activateSessionPackPayments(normalized, savedSettings)
        : await updateSoftLaunchSettings(normalized, savedSettings);
      setSettings(updated);
      setSavedSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    try {
      const normalized = normalizeLaunchSettings(settings);
      if (livePaymentSettingsRequirePause(normalized, savedSettings)) {
        toast({
          title: 'Pause pack checkout first',
          description: paymentSettingsPauseRequiredMessage(),
          variant: 'destructive',
        });
        return;
      }
      if (paymentActivationRequiresBookings(normalized)) {
        toast({
          title: 'Enable bookings first',
          description: paymentActivationRequiresBookingsMessage(),
          variant: 'destructive',
        });
        return;
      }
      if (normalized.bookings_enabled) {
        setSaving(true);
        const bookingGuardReady = await memberBookingSwitchGuardReady();
        setSaving(false);
        if (!bookingGuardReady) {
          toast({
            title: 'Bookings stay paused',
            description: 'Operations Health must verify the member booking-switch guard before bookings can go live.',
            variant: 'destructive',
          });
          return;
        }
      }
      const activatingPayments = normalized.payments_enabled && !savedSettings.payments_enabled;
      if (!activatingPayments) {
        await persistSettings(normalized);
        return;
      }

      setSaving(true);
      const health = await getCommerceConfigurationHealth();
      setSaving(false);
      if (!health.ready) {
        const reason = health.issues?.[0]?.reason || 'Open Operations Health and complete every Stripe launch check first.';
        toast({ title: 'Stripe is not ready to activate', description: reason, variant: 'destructive' });
        return;
      }
      setPendingPaymentActivation(normalized);
    } catch (e) {
      setSaving(false);
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
  };

  if (loading) return <div className="p-6"><div className="h-40 bg-xert-ink animate-pulse" /></div>;
  if (loadError) return <div className="p-6"><AdminLoadError message={loadError} onRetry={load} /></div>;

  const Toggle = ({ label, desc, field }) => (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-xert-steel/20">
      <div id={`${field}-description`}>
        <p className="font-body text-sm text-xert-offwhite">{label}</p>
        {desc && <p className="font-body text-xs text-xert-concrete/40 mt-0.5">{desc}</p>}
      </div>
      <button type="button" role="switch" aria-checked={Boolean(settings[field])} aria-labelledby={`${field}-description`} onClick={() => set(field, !settings[field])}
        className={`relative min-w-12 w-12 min-h-11 rounded-full transition-colors shrink-0 ${settings[field] ? 'bg-xert-steel' : 'bg-xert-steel/40'}`}>
        <div className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white transition-transform ${settings[field] ? 'translate-x-7' : 'translate-x-1'}`} />
      </button>
    </div>
  );

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="font-display text-xl text-xert-offwhite uppercase mb-6">Soft Launch Settings</h2>
      <p className="font-body text-xs text-xert-concrete/50 mb-4">Every control below updates a live public-site behavior.</p>
      {dirty && (
        <div className="mb-4 px-4 py-3 border border-xert-steel/40 bg-xert-steel/10 font-body text-xs text-xert-pale" role="status">
          Unsaved changes. The public site will not change until these settings are saved.
        </div>
      )}

      <div className="bg-xert-ink border border-xert-steel/20 p-6 mb-6 space-y-0">
        <Toggle label="Countdown enabled" desc="Shows countdown timer on public pages." field="countdown_enabled" />
        <Toggle label="Bookings enabled" desc="Shows booking buttons on class cards. When off, shows Register Interest CTA." field="bookings_enabled" />
        <Toggle label="Prices coming soon" desc="When on, public session-pack pricing shows 'Coming soon' instead of amounts. Turn off to reveal real prices." field="prices_coming_soon" />
        <Toggle label="Session pack payments" desc="Master checkout switch for pack purchases on the website and iOS app. Keep off until Stripe launch checks pass." field="payments_enabled" />
        <Toggle label="Announcement banner" desc="Shows a banner across the top of the public site." field="announcement_banner_enabled" />
      </div>

      <div className="bg-xert-ink border border-xert-steel/20 p-6 space-y-5 mb-6">
        <div>
          <label htmlFor="target-launch-date" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-2">Target launch date</label>
          <input id="target-launch-date" type="date" value={settings.target_launch_date || ''} onChange={e => set('target_launch_date', e.target.value)}
            className="w-full bg-xert-charcoal border border-xert-steel/40 px-4 py-3 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
        </div>
        <div>
          <label htmlFor="announcement-banner-text" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-2">Announcement banner text</label>
          <input id="announcement-banner-text" value={settings.announcement_banner_text || ''} onChange={e => set('announcement_banner_text', e.target.value)}
            placeholder="e.g. Soft launch registrations now open — sign up today!"
            className="w-full bg-xert-charcoal border border-xert-steel/40 px-4 py-3 font-body text-sm text-xert-offwhite placeholder-xert-concrete/30 focus:outline-none focus:border-xert-red" />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={handleSave} disabled={saving || !dirty}
          className={`flex-1 min-h-12 py-3 font-display text-base uppercase transition-colors disabled:opacity-50 ${saved ? 'bg-green-600 text-xert-navy' : 'bg-xert-steel text-xert-navy hover:bg-xert-pale'}`}>
          {saved ? 'Saved ✓' : saving ? 'Saving...' : dirty ? 'Save settings' : 'Settings saved'}
        </button>
        {dirty && (
          <button type="button" onClick={() => { setSettings(savedSettings); setSaved(false); }} disabled={saving}
            className="min-h-12 px-5 py-3 border border-xert-red/30 font-body text-xs uppercase tracking-wider text-xert-red/70 hover:border-xert-red hover:text-xert-red disabled:opacity-50">
            Discard changes
          </button>
        )}
      </div>
      <AdminConfirmDialog
        open={Boolean(pendingPaymentActivation)}
        onOpenChange={open => !open && setPendingPaymentActivation(null)}
        title="Open session pack checkout?"
        description="Stripe launch checks are passing. Saving will allow signed-in members to start real pack purchases on the website and iOS app."
        warning="Run one low-value purchase and refund immediately after activation."
        cancelLabel="Keep payments paused"
        confirmLabel="Enable pack checkout"
        busy={saving}
        onConfirm={() => {
          const pending = pendingPaymentActivation;
          setPendingPaymentActivation(null);
          if (pending) void persistSettings(pending, true);
        }}
      />
    </div>
  );
}
