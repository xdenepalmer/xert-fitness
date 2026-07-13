import React from 'react';
import { Link } from 'react-router-dom';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';
import AdminLogin from '@/pages/AdminLogin';

/**
 * Guards admin routes using Supabase Auth + the profiles.role column.
 * Shows a loader while the session resolves, the login screen when signed
 * out, an access-denied screen for signed-in non-admins, and the protected
 * admin content only when profiles.role = 'admin'.
 */
export default function AdminRoute({ children }) {
  const { session, isAdmin, loading, profileLoading, signOut } = useSupabaseAuth();

  // Wait for the profile fetch too — evaluating isAdmin before the profile
  // resolves flashes the access-denied screen at genuine admins mid-login.
  if (loading || (session && profileLoading)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-xert-black">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-xert-steel/30 border-t-xert-red rounded-full animate-spin" />
          <span className="font-display text-xs text-xert-concrete/30 uppercase tracking-widest">XERT</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return <AdminLogin />;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: '#101820' }}>
        <div className="max-w-md text-center">
          <p className="font-display text-3xl uppercase text-xert-offwhite mb-3">Admin access only</p>
          <p className="font-body text-sm leading-relaxed mb-8" style={{ color: 'rgba(209,221,230,0.6)' }}>
            This account doesn&rsquo;t have admin access. If you&rsquo;re a member, head to your account to see your
            credits and bookings.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/account"
              className="px-6 py-3 font-display text-base uppercase tracking-wide"
              style={{ backgroundColor: '#7BA7BC', color: '#101820' }}>
              My Account
            </Link>
            <button onClick={signOut}
              className="px-6 py-3 font-display text-base uppercase tracking-wide border"
              style={{ borderColor: 'rgba(123,167,188,0.35)', color: '#D1DDE6' }}>
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
