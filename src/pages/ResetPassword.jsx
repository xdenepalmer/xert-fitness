// @ts-nocheck -- typed wrapper props are introduced during the UI migration.
import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  requireSupabaseConfiguration,
  supabase,
  supabaseConfigurationReady,
} from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

// Icons sit inside the field, so the left padding is set inline: it must win
// over the shared .xert-input padding regardless of stylesheet order.
const fieldClasses =
  "xert-input h-12 text-base md:text-base shadow-none focus-visible:ring-[3px] focus-visible:ring-xert-steel/20 focus-visible:border-xert-steel";
const fieldStyle = { paddingLeft: "2.75rem" };
const labelClasses = "xert-label";
const errorClasses = "mb-4 rounded-xl border p-3 font-body text-sm";
const errorStyle = { color: "#f0a1a1", borderColor: "rgba(240,161,161,0.35)", backgroundColor: "rgba(240,161,161,0.08)" };

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [linkValid, setLinkValid] = useState(false);

  useEffect(() => {
    let active = true;

    const prepareSession = async () => {
      setCheckingLink(true);
      setError("");

      try {
        requireSupabaseConfiguration();
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }

        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (active) setLinkValid(Boolean(data.session));
      } catch (err) {
        if (active) {
          setLinkValid(false);
          setError(err.message || "Password reset link is invalid or expired");
        }
      } finally {
        if (active) setCheckingLink(false);
      }
    };

    prepareSession();

    return () => {
      active = false;
    };
  }, [code]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      requireSupabaseConfiguration();
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      window.location.href = "/login";
    } catch (err) {
      setError(err.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  if (checkingLink) {
    return (
      <AuthLayout
        icon={Lock}
        eyebrow="Account recovery"
        title="Checking reset link"
        subtitle="One moment while we verify your Supabase session"
      >
        <div className="flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-xert-steel" />
        </div>
      </AuthLayout>
    );
  }

  if (!linkValid) {
    return (
      <AuthLayout
        icon={AlertTriangle}
        eyebrow="Account recovery"
        title={supabaseConfigurationReady ? "Invalid reset link" : "Service unavailable"}
        subtitle={supabaseConfigurationReady
          ? "This password reset link is missing, invalid or expired"
          : "Account recovery is temporarily unavailable"}
        footer={supabaseConfigurationReady ? (
          <Link to="/forgot-password" className="text-xert-steel font-medium hover:text-xert-pale hover:underline">
            Request a new link
          </Link>
        ) : null}
      >
        {error && (
          <div className={errorClasses} style={errorStyle}>
            {error}
          </div>
        )}
        <p className="font-body text-sm text-xert-pale/80 text-center">
          {supabaseConfigurationReady
            ? "Please request a new password reset email from the login screen."
            : "Please try again shortly."}
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Lock}
      eyebrow="Account recovery"
      title="New password"
      subtitle="Enter your new password below"
    >
      {error && (
        <div className={errorClasses} style={errorStyle}>
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="password" className={labelClasses}>New Password</Label>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-xert-steel/60 pointer-events-none" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={fieldClasses}
              style={fieldStyle}
              required
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="confirm" className={labelClasses}>Confirm Password</Label>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-xert-steel/60 pointer-events-none" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
              Resetting...
            </>
          ) : (
            "Reset password"
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
