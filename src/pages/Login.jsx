// @ts-nocheck -- typed wrapper props are introduced during the UI migration.
import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  requireSupabaseConfiguration,
  supabase,
  supabaseConfigurationReady,
} from "@/lib/supabase";
import { PUBLIC_SERVICE_UNAVAILABLE_MESSAGE } from "@/lib/publicRuntimeConfig";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { useSupabaseAuth } from "@/lib/SupabaseAuthContext";
import { authPathWithNext, safeAuthReturnPath } from "@/lib/authRedirect";

// Icons sit inside the field, so the left padding is set inline: it must win
// over the shared .xert-input padding regardless of stylesheet order.
const fieldClasses =
  "xert-input h-12 text-base md:text-base shadow-none focus-visible:ring-[3px] focus-visible:ring-xert-steel/20 focus-visible:border-xert-steel";
const fieldStyle = { paddingLeft: "2.75rem" };
const labelClasses = "xert-label";
const errorClasses = "mb-4 rounded-xl border p-3 font-body text-sm";
const errorStyle = { color: "#f0a1a1", borderColor: "rgba(240,161,161,0.35)", backgroundColor: "rgba(240,161,161,0.08)" };

export default function Login() {
  const { session } = useSupabaseAuth();
  const [searchParams] = useSearchParams();
  const returnPath = safeAuthReturnPath(searchParams.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) window.location.replace(returnPath);
  }, [returnPath, session]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      requireSupabaseConfiguration();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      window.location.replace(returnPath);
    } catch (err) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    try {
      requireSupabaseConfiguration();
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}${authPathWithNext('/login', returnPath)}`,
        },
      });
      if (signInError) throw signInError;
    } catch (err) {
      setError(err.message || "Google sign-in failed");
    }
  };

  const visibleError = supabaseConfigurationReady
    ? error
    : PUBLIC_SERVICE_UNAVAILABLE_MESSAGE;

  return (
    <AuthLayout
      icon={LogIn}
      eyebrow="Member access"
      title="Welcome back"
      subtitle="Log in to your account"
      footer={
        <>
          Don't have an account?{" "}
          <Link to={authPathWithNext('/register', returnPath)} className="text-xert-steel font-medium hover:text-xert-pale hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <button
        type="button"
        className="xert-btn-ghost w-full min-h-[52px] inline-flex items-center justify-center font-body text-sm font-medium mb-6"
        onClick={handleGoogle}
        disabled={!supabaseConfigurationReady || loading}
      >
        <GoogleIcon className="w-5 h-5 mr-2" />
        Continue with Google
      </button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-xert-steel/20" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-[0.2em]">
          <span className="bg-xert-ink px-3 font-body text-xert-pale/60">or</span>
        </div>
      </div>

      {visibleError && (
        <div className={errorClasses} style={errorStyle}>
          {visibleError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="email" className={labelClasses}>Email</Label>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-xert-steel/60 pointer-events-none" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClasses}
              style={fieldStyle}
              required
            />
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className={labelClasses}>Password</Label>
            <Link to="/forgot-password" className="text-xs text-xert-steel hover:text-xert-pale hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-xert-steel/60 pointer-events-none" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClasses}
              style={fieldStyle}
              required
            />
          </div>
        </div>
        <button
          type="submit"
          className="xert-btn-primary w-full min-h-[52px] inline-flex items-center justify-center font-display text-base uppercase tracking-wide disabled:opacity-50 disabled:pointer-events-none"
          disabled={loading || !supabaseConfigurationReady}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Logging in...
            </>
          ) : (
            "Log in"
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
