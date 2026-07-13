import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, CheckCircle2, CircleAlert, Database, Loader2,
  RefreshCw, ShieldCheck,
} from 'lucide-react';
import { getOperationsHealth } from '@/lib/adminData';
import { toast } from '@/components/ui/use-toast';
import AdminLoadError from '@/components/admin/AdminLoadError';

const STATUS_STYLE = {
  ok: {
    label: 'Ready',
    icon: CheckCircle2,
    color: '#7ec98f',
    bg: 'rgba(126,201,143,0.1)',
    border: 'rgba(126,201,143,0.28)',
  },
  attention: {
    label: 'Needs attention',
    icon: AlertTriangle,
    color: '#e0b36a',
    bg: 'rgba(224,179,106,0.1)',
    border: 'rgba(224,179,106,0.28)',
  },
  error: {
    label: 'Error',
    icon: CircleAlert,
    color: '#f87171',
    bg: 'rgba(248,113,113,0.1)',
    border: 'rgba(248,113,113,0.28)',
  },
};

const ROUTES = {
  products: 'products',
  classes: 'calendar',
  coaches: 'coaches',
  events: 'events',
  cms: 'content',
  orders: 'orders',
  admins: 'gym-members',
  'commerce-config': 'products',
};

export default function OperationsHealth({ onNavigate }) {
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      setChecks(await getOperationsHealth());
    } catch (error) {
      setChecks([]);
      setLoadError(error.message);
      toast({ title: 'Health check failed', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const summary = useMemo(() => {
    const errors = checks.filter(c => c.status === 'error').length;
    const attention = checks.filter(c => c.status === 'attention').length;
    const ok = checks.filter(c => c.status === 'ok').length;
    return { ok, attention, errors };
  }, [checks]);

  return (
    <div className="p-6 space-y-6">
      <div className="relative p-6 overflow-hidden"
        style={{
          background: 'linear-gradient(120deg, rgba(50,72,90,0.42) 0%, rgba(16,24,32,0.74) 60%)',
          border: '1px solid rgba(123,167,188,0.2)',
        }}>
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 flex items-center justify-center" style={{ backgroundColor: 'rgba(123,167,188,0.16)' }}>
              <ShieldCheck className="w-6 h-6" style={{ color: '#7BA7BC' }} />
            </div>
            <div>
              <p className="font-body text-[11px] uppercase tracking-[0.25em] mb-1" style={{ color: '#7BA7BC' }}>
                Operations Health
              </p>
              <h2 className="font-display text-3xl uppercase leading-none" style={{ color: '#F1F3F4' }}>
                Launch readiness at a glance.
              </h2>
            </div>
          </div>
          <button onClick={load} disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 font-body text-xs uppercase tracking-wider border transition-colors disabled:opacity-50"
            style={{ borderColor: 'rgba(123,167,188,0.28)', color: '#D1DDE6' }}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Ready', value: summary.ok, color: '#7ec98f' },
          { label: 'Attention', value: summary.attention, color: '#e0b36a' },
          { label: 'Errors', value: summary.errors, color: '#f87171' },
        ].map(item => (
          <div key={item.label} className="p-4" style={{ backgroundColor: 'rgba(16,24,32,0.6)', border: '1px solid rgba(123,167,188,0.16)' }}>
            <p className="font-display text-3xl tabular-nums leading-none" style={{ color: item.color }}>
              {loading ? '-' : item.value}
            </p>
            <p className="font-body text-[10px] uppercase tracking-[0.2em] mt-1" style={{ color: 'rgba(209,221,230,0.45)' }}>
              {item.label}
            </p>
          </div>
        ))}
      </div>

      {loadError && <AdminLoadError message={loadError} onRetry={load} />}

      {loadError ? null : loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-36 bg-xert-ink animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {checks.map(check => {
            const style = STATUS_STYLE[check.status] || STATUS_STYLE.ok;
            const Icon = style.icon;
            const target = ROUTES[check.key];

            return (
              <article key={check.key} className="p-5 flex flex-col"
                style={{ backgroundColor: style.bg, border: `1px solid ${style.border}` }}>
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-10 h-10 flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(16,24,32,0.42)' }}>
                    {check.key === 'supabase'
                      ? <Database className="w-5 h-5" style={{ color: style.color }} />
                      : <Icon className="w-5 h-5" style={{ color: style.color }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <h3 className="font-display text-xl uppercase leading-none text-xert-offwhite">{check.label}</h3>
                      <span className="font-body text-[10px] uppercase tracking-wider shrink-0" style={{ color: style.color }}>
                        {style.label}
                      </span>
                    </div>
                    <p className="font-body text-sm leading-relaxed" style={{ color: 'rgba(209,221,230,0.68)' }}>
                      {check.detail}
                    </p>
                  </div>
                </div>

                {check.action && (
                  <p className="font-body text-xs leading-relaxed mt-auto" style={{ color: 'rgba(209,221,230,0.52)' }}>
                    {check.action}
                  </p>
                )}

                {target && (
                  <button onClick={() => onNavigate?.(target)}
                    className="inline-flex items-center gap-2 self-start mt-4 font-body text-xs uppercase tracking-wider"
                    style={{ color: '#7BA7BC' }}>
                    Open section
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
