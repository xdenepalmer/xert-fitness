// @ts-nocheck -- typed wrapper props are introduced during the UI migration.
import React, { useState } from "react";
import { Link } from "react-router-dom";
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

const fieldClasses =
  "pl-10 h-12 rounded-none border-xert-steel/40 bg-[#0b1218] text-base md:text-base text-xert-offwhite placeholder:text-xert-pale/60 shadow-none focus-visible:ring-0 focus-visible:border-xert-steel";
const labelClasses = "font-body text-xs uppercase tracking-wider text-xert-pale/70";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      window.location.href = "/";
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
          redirectTo: window.location.origin,
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
          <Link to="/register" className="text-xert-steel font-medium hover:text-xert-pale hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <button
        type="button"
        className="xert-btn-ghost w-full h-12 inline-flex items-center justify-center font-body text-sm font-medium mb-6"
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
        <div className="mb-4 p-3 border border-xert-steel/50 bg-xert-steel/10 font-body text-sm text-xert-steel">
          {visibleError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email" className={labelClasses}>Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-xert-steel/60" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClasses}
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className={labelClasses}>Password</Label>
            <Link to="/forgot-password" className="text-xs text-xert-steel hover:text-xert-pale hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-xert-steel/60" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClasses}
              required
            />
          </div>
        </div>
        <button
          type="submit"
          className="xert-btn-primary w-full py-4 inline-flex items-center justify-center font-display text-base uppercase tracking-wide disabled:opacity-50 disabled:pointer-events-none"
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
