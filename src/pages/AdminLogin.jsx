import React, { useState } from 'react';
import { Lock, AlertCircle } from 'lucide-react';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';

export default function AdminLogin() {
  const { signIn } = useSupabaseAuth();
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
          <div className="inline-flex items-center justify-center w-12 h-12 mb-4" style={{ backgroundColor: '#7BA7BC' }}>
            <Lock className="w-5 h-5" style={{ color: '#101820' }} />
          </div>
          <div className="flex items-baseline justify-center gap-2">
            <span className="font-display text-2xl text-xert-offwhite uppercase">XERT</span>
            <span className="font-display text-xs uppercase tracking-widest" style={{ color: 'rgba(123,167,188,0.5)' }}>Command</span>
          </div>
          <p className="font-body text-xs mt-2 uppercase tracking-wider" style={{ color: 'rgba(209,221,230,0.35)' }}>Admin sign in</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-body text-xs uppercase tracking-wider mb-2" style={{ color: 'rgba(209,221,230,0.5)' }}>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full px-4 py-3 font-body text-sm text-xert-offwhite outline-none transition-colors"
              style={{ backgroundColor: 'rgba(50,72,90,0.2)', border: '1px solid rgba(123,167,188,0.2)' }}
              onFocus={e => e.currentTarget.style.borderColor = '#7BA7BC'}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(123,167,188,0.2)'}
            />
          </div>

          <div>
            <label className="block font-body text-xs uppercase tracking-wider mb-2" style={{ color: 'rgba(209,221,230,0.5)' }}>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full px-4 py-3 font-body text-sm text-xert-offwhite outline-none transition-colors"
              style={{ backgroundColor: 'rgba(50,72,90,0.2)', border: '1px solid rgba(123,167,188,0.2)' }}
              onFocus={e => e.currentTarget.style.borderColor = '#7BA7BC'}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(123,167,188,0.2)'}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3" style={{ backgroundColor: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)' }}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#f87171' }} />
              <p className="font-body text-xs" style={{ color: '#fca5a5' }}>{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 font-display text-base uppercase tracking-wide transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ backgroundColor: '#7BA7BC', color: '#101820' }}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center font-body text-xs mt-6" style={{ color: 'rgba(209,221,230,0.25)' }}>
          Admin access only. Accounts are managed in Supabase.
        </p>
      </div>
    </div>
  );
}