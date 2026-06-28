import React from 'react';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';
import AdminLogin from '@/pages/AdminLogin';

/**
 * Guards admin routes using Supabase Auth.
 * Shows a loader while the session resolves, the login screen when
 * signed out, and the protected admin content when signed in.
 */
export default function AdminRoute({ children }) {
  const { session, loading } = useSupabaseAuth();

  if (loading) {
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

  return children;
}