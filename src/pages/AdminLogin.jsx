import React, { useState } from 'react';
import { Lock, AlertCircle } from 'lucide-react';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';

export default function AdminLogin() {
  const { signIn, serviceReady } = useSupabaseAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      // On success the auth listener updates the session and AdminRoute renders the panel.
    } catch (err) {
      setError(err.message || 'Sign in failed. Check your email and password.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-xert-black">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 mb-4" style={{ backgroundColor: 'var(--accent-default)' }}>
            <Lock className="w-5 h-5" style={{ color: 'var(--surface-base)' }} />
          </div>
          <div className="flex items-baseline justify-center gap-2">
            <span className="font-display text-2xl text-xert-offwhite uppercase">XERT</span>
            <span className="font-display text-xs uppercase tracking-widest" style={{ color: 'var(--accent-default-50)' }}>Command</span>
          </div>
          <p className="font-body text-xs mt-2 uppercase tracking-wider" style={{ color: 'var(--text-secondary-35)' }}>Admin sign in</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-body text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary-50)' }}>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full px-4 py-3 font-body text-sm text-xert-offwhite outline-none transition-colors"
              style={{ backgroundColor: 'var(--surface-secondary-20)', border: '1px solid var(--accent-default-20)' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--accent-default)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--accent-default-20)'}
            />
          </div>

          <div>
            <label className="block font-body text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary-50)' }}>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full px-4 py-3 font-body text-sm text-xert-offwhite outline-none transition-colors"
              style={{ backgroundColor: 'var(--surface-secondary-20)', border: '1px solid var(--accent-default-20)' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--accent-default)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--accent-default-20)'}
            />
          </div>

          {(error || !serviceReady) && (
            <div className="flex items-start gap-2 p-3" style={{ backgroundColor: 'var(--state-danger-strong-12)', border: '1px solid var(--state-danger-strong-30)' }}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--state-danger-bright)' }} />
              <p className="font-body text-xs" style={{ color: 'var(--state-danger-pale)' }}>
                {serviceReady ? error : 'XERT services are temporarily unavailable.'}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !serviceReady}
            className="w-full py-3.5 font-display text-base uppercase tracking-wide transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent-default)', color: 'var(--surface-base)' }}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center font-body text-xs mt-6" style={{ color: 'var(--text-secondary-25)' }}>
          Admin access only. Accounts are managed in Supabase.
        </p>
      </div>
    </div>
  );
}
