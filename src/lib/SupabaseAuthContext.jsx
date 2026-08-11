import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  requireSupabaseConfiguration,
  supabase,
  supabaseConfigurationReady,
} from '@/lib/supabase';

const SupabaseAuthContext = createContext(null);

export const SupabaseAuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const retryProfileRef = useRef(() => {});
  const profileRetryInFlightRef = useRef(false);

  const retryProfile = useCallback(async () => {
    // React state does not disable the button until the next render. This
    // synchronous guard prevents a fast double tap from starting two role
    // verification requests in that gap.
    if (profileRetryInFlightRef.current) return;
    profileRetryInFlightRef.current = true;
    try {
      await retryProfileRef.current();
    } finally {
      profileRetryInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    let active = true;
    if (!supabaseConfigurationReady) {
      setLoading(false);
      return () => {
        active = false;
      };
    }
    // Monotonic id so only the latest profile fetch may write state. A slow
    // fetch for an earlier session can no longer overwrite a newer result or
    // resurrect a profile after SIGNED_OUT cleared it.
    let profileRequestId = 0;
    // Whichever source (initial getSession or a live auth event) applies a
    // session first owns the current generation. A late initial snapshot is
    // ignored once a newer SIGNED_IN/SIGNED_OUT event has arrived.
    let sessionVersion = 0;
    // User id the current profile state belongs to. Token refreshes for the
    // same user refetch silently instead of flipping profileLoading (which
    // would unmount gated admin UI mid-session).
    let loadedProfileUserId = null;

    async function loadProfile(currentSession, { interactive = false } = {}) {
      const requestId = ++profileRequestId;
      const userId = currentSession?.user?.id || null;
      if (!userId) {
        loadedProfileUserId = null;
        if (active) {
          setProfile(null);
          setProfileError(null);
          setProfileLoading(false);
        }
        return;
      }
      if (active && (userId !== loadedProfileUserId || interactive)) {
        if (userId !== loadedProfileUserId) setProfile(null);
        setProfileError(null);
        setProfileLoading(true);
      }
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        if (error) throw error;
        if (active && requestId === profileRequestId) {
          loadedProfileUserId = userId;
          setProfile(data || null);
          setProfileError(null);
        }
      } catch (error) {
        if (active && requestId === profileRequestId) {
          // Keep a previously verified profile for the same signed-in user.
          // Supabase RLS remains the final authority for every admin mutation,
          // while a first-time/unverified profile lookup still fails closed.
          setProfileError(error?.message || 'Profile verification is temporarily unavailable.');
        }
      } finally {
        if (active && requestId === profileRequestId) setProfileLoading(false);
      }
    }

    function applySession(nextSession) {
      const version = ++sessionVersion;
      setSession(nextSession);
      retryProfileRef.current = () => loadProfile(nextSession, { interactive: true });
      loadProfile(nextSession).finally(() => {
        if (active && version === sessionVersion) setLoading(false);
      });
    }

    supabase.auth.getSession()
      .then(({ data }) => {
        if (!active || sessionVersion !== 0) return;
        applySession(data.session);
      })
      .catch(() => {
        if (active && sessionVersion === 0) setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return;
      applySession(newSession);
    });

    return () => {
      active = false;
      retryProfileRef.current = () => {};
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const signIn = async (email, password) => {
    requireSupabaseConfiguration();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  };

  const signOut = async () => {
    if (!supabaseConfigurationReady) return;
    await supabase.auth.signOut();
  };

  return (
    <SupabaseAuthContext.Provider
      value={{
        session,
        user: session?.user || null,
        profile,
        isAdmin: profile?.role === 'admin',
        loading,
        profileLoading,
        profileError,
        serviceReady: supabaseConfigurationReady,
        retryProfile,
        signIn,
        signOut,
      }}
    >
      {children}
    </SupabaseAuthContext.Provider>
  );
};

export const useSupabaseAuth = () => {
  const ctx = useContext(SupabaseAuthContext);
  if (!ctx) throw new Error('useSupabaseAuth must be used within a SupabaseAuthProvider');
  return ctx;
};
