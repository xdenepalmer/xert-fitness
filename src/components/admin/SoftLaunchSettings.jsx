import React, { useState, useEffect } from 'react';
import { toast } from '@/components/ui/use-toast';
import { getSoftLaunchSettings, updateSoftLaunchSettings, getDefaultSettings } from '@/lib/adminData';
import AdminLoadError from '@/components/admin/AdminLoadError';
import { normalizeLaunchSettings } from '@/lib/launchSettings';

export default function SoftLaunchSettings() {
  const [settings, setSettings] = useState(getDefaultSettings());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState('');

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const loadedSettings = await getSoftLaunchSettings();
      if (loadedSettings) setSettings(loadedSettings);
    } catch (error) {
      setLoadError(error.message || 'Check the admin settings table and admin permissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const set = (k, v) => setSettings(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSoftLaunchSettings(normalizeLaunchSettings(settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
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
        className={`relative min-w-12 w-12 min-h-11 rounded-full transition-colors shrink-0 ${settings[field] ? 'bg-xert-red' : 'bg-xert-steel/40'}`}>
        <div className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white transition-transform ${settings[field] ? 'translate-x-7' : 'translate-x-1'}`} />
      </button>
    </div>
  );

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="font-display text-xl text-xert-offwhite uppercase mb-6">Soft Launch Settings</h2>
      <p className="font-body text-xs text-xert-concrete/50 mb-4">Every control below updates a live public-site behavior.</p>

      <div className="bg-xert-ink border border-xert-steel/20 p-6 mb-6 space-y-0">
        <Toggle label="Countdown enabled" desc="Shows countdown timer on public pages." field="countdown_enabled" />
        <Toggle label="Bookings enabled" desc="Shows booking buttons on class cards. When off, shows Register Interest CTA." field="bookings_enabled" />
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

      <button onClick={handleSave} disabled={saving}
        className={`w-full py-4 font-display text-base uppercase transition-colors disabled:opacity-50 ${saved ? 'bg-green-600 text-white' : 'bg-xert-red text-white hover:bg-xert-orange'}`}>
        {saved ? 'Saved ✓' : saving ? 'Saving...' : 'Save settings'}
      </button>
    </div>
  );
}
