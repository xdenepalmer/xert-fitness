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
import { Mail, ArrowLeft, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

// Icons sit inside the field, so the left padding is set inline: it must win
// over the shared .xert-input padding regardless of stylesheet order.
const fieldClasses =
  "xert-input h-12 text-base md:text-base shadow-none focus-visible:ring-[3px] focus-visible:ring-xert-steel/20 focus-visible:border-xert-steel";
const fieldStyle = { paddingLeft: "2.75rem" };
const labelClasses = "xert-label";
const errorClasses = "mb-4 rounded-xl border p-3 font-body text-sm";
const errorStyle = { color: "#f0a1a1", borderColor: "rgba(240,161,161,0.35)", backgroundColor: "rgba(240,161,161,0.08)" };

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!supabaseConfigurationReady) {
      setError(PUBLIC_SERVICE_UNAVAILABLE_MESSAGE);
      return;
    }
    setLoading(true);
    try {
      requireSupabaseConfiguration();
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      // Always show success regardless
    } finally {
      setLoading(false);
      setSent(true);
    }
  };

  return (
    <AuthLayout
      icon={Mail}
      eyebrow="Account recovery"
      title="Reset password"
      subtitle="We'll send you a link to reset it"
      footer={
        <Link to="/login" className="text-xert-steel font-medium hover:text-xert-pale hover:underline">
          <ArrowLeft className="w-3 h-3 inline mr-1" />Back to log in
        </Link>
      }
    >
      {error && (
        <div className={errorClasses} style={errorStyle}>
          {error}
        </div>
      )}
      {sent ? (
        <p className="font-body text-sm text-xert-pale/80 text-center">
          If an account exists with that email, you'll receive a password reset link shortly.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email" className={labelClasses}>Email address</Label>
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
          <button
            type="submit"
            className="xert-btn-primary w-full min-h-[52px] inline-flex items-center justify-center font-display text-base uppercase tracking-wide disabled:opacity-50 disabled:pointer-events-none"
            disabled={loading || !supabaseConfigurationReady}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              "Send reset link"
            )}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
