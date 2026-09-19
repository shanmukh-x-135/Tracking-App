"use client";

import Link from "next/link";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { getAuthGateway } from "@/lib/auth/gateway";

export function AuthScreen({ mode }: { mode: "login" | "signup" }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const router = useRouter();
  const { refresh } = useAuth();
  const isSignup = mode === "signup";
  const returnTo = typeof window === "undefined" ? "/home" : safeReturnTo(new URLSearchParams(window.location.search).get("returnTo"));

  async function finishAuthentication(action: () => Promise<{ user?: unknown; message?: string }>) {
    setError(undefined);
    setMessage(undefined);
    setIsSubmitting(true);
    try {
      const result = await action();
      if (result.message) setMessage(result.message);
      if (result.user) {
        await refresh();
        router.replace(returnTo);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication could not be completed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submit(formData: FormData) {
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    await finishAuthentication(() => isSignup
      ? getAuthGateway().signUp(email, password, String(formData.get("displayName") ?? ""))
      : getAuthGateway().signIn(email, password));
  }

  async function signInWithGoogle() {
    await finishAuthentication(async () => {
      await getAuthGateway().signInWithGoogle(returnTo);
      return { user: await getAuthGateway().getUser() ?? undefined };
    });
  }

  return <main className="auth-page">
    <div className="auth-art"><div className="auth-art-copy">
      <Link href="/home" className="brand"><span className="brand-mark"/>Mosaic</Link>
      <blockquote>“Every story you carry,<br/>all in one place.”</blockquote>
      <p>Movies · Series · Games · Books</p>
    </div></div>
    <section className="auth-panel"><div className="auth-card">
      <span className="eyebrow">Welcome to Mosaic</span>
      <h1>{isSignup ? "Start your story" : "Good to see you"}</h1>
      <p className="muted">{isSignup ? "Build a living library of everything that moves you." : "Sign in to continue your library, logs, and lists."}</p>
      <form action={submit} className="auth-form">
        {isSignup && <label className="field">Display name<input name="displayName" autoComplete="name" required maxLength={80} placeholder="How friends will know you"/></label>}
        <label className="field">Email<input name="email" type="email" autoComplete="email" required placeholder="you@example.com"/></label>
        <label className="field">Password<input name="password" type="password" autoComplete={isSignup ? "new-password" : "current-password"} required minLength={8} placeholder="At least 8 characters"/></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="form-success" role="status">{message}</p>}
        <button className="button primary auth-submit" disabled={isSubmitting}>{isSubmitting ? <LoaderCircle className="spin" size={17}/> : <>{isSignup ? "Create account" : "Sign in"}<ArrowRight size={16}/></>}</button>
      </form>
      <div className="auth-divider"><span>or</span></div>
      <button className="button auth-submit" onClick={() => void signInWithGoogle()} disabled={isSubmitting}>Continue with Google</button>
      <p className="auth-switch">{isSignup ? "Already have an account?" : "New to Mosaic?"} <Link href={`${isSignup ? "/login" : "/signup"}?returnTo=${encodeURIComponent(returnTo)}`}>{isSignup ? "Sign in" : "Create one"}</Link></p>
    </div></section>
  </main>;
}

function safeReturnTo(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/home";
}
