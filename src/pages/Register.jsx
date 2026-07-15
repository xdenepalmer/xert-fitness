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
import { UserPlus, Mail, Lock, Loader2, CheckCircle2, User } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";

const fieldClasses =
  "pl-10 h-12 rounded-none border-xert-steel/40 bg-[#0b1218] text-base md:text-base text-xert-offwhite placeholder:text-xert-pale/60 shadow-none focus-visible:ring-0 focus-visible:border-xert-steel";
const labelClasses = "font-body text-xs uppercase tracking-wider text-xert-pale/70";

export default function Register() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      requireSupabaseConfiguration();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { full_name: fullName.trim() },
        },
      });

      if (signUpError) throw signUpError;
      if (data.session) {
        window.location.href = "/";
        return;
      }

      setRegistered(true);
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    try {
      requireSupabaseConfiguration();
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      if (resendError) throw resendError;
    } catch (err) {
      setError(err.message || "Failed to resend confirmation email");
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

  if (registered) {
    return (
      <AuthLayout
        icon={CheckCircle2}
        eyebrow="Confirm email"
        title="Check your email"
        subtitle={`We sent a confirmation link to ${email}`}
        footer={
          <Link to="/login" className="text-xert-steel font-medium hover:text-xert-pale hover:underline">
            Back to log in
          </Link>
        }
      >
        {visibleError && (
          <div className="mb-4 p-3 border border-xert-steel/50 bg-xert-steel/10 font-body text-sm text-xert-steel">
            {visibleError}
          </div>
        )}
        <p className="font-body text-sm text-xert-pale/80 text-center mb-4">
          Open the confirmation link from Supabase to activate the account.
        </p>
        <p className="text-center font-body text-sm text-xert-pale/60">
          Didn't receive it?{" "}
          <button
            onClick={handleResend}
            disabled={!supabaseConfigurationReady}
            className="text-xert-steel font-medium hover:text-xert-pale hover:underline disabled:opacity-50"
          >
            Resend
          </button>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={UserPlus}
      eyebrow="Join XERT"
      title="Create your account"
      subtitle="Sign up to get started"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-xert-steel font-medium hover:text-xert-pale hover:underline">
            Log in
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
          <Label htmlFor="fullName" className={labelClasses}>Full Name</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-xert-steel/60" aria-hidden="true" />
            <Input
              id="fullName"
              type="text"
              autoComplete="name"
              autoFocus
              placeholder="Your name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={fieldClasses}
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email" className={labelClasses}>Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-xert-steel/60" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClasses}
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className={labelClasses}>Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-xert-steel/60" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClasses}
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm" className={labelClasses}>Confirm Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-xert-steel/60" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </button>
        <p className="text-xs text-center font-body text-xert-pale/60 leading-relaxed">
          By creating an account, you agree to the <Link to="/terms" className="text-xert-steel underline hover:text-xert-pale">Terms of Use</Link> and acknowledge the <Link to="/privacy" className="text-xert-steel underline hover:text-xert-pale">Privacy Policy</Link>.
        </p>
      </form>
    </AuthLayout>
  );
}
