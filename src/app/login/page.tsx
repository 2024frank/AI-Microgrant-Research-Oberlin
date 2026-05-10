"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Landmark } from "lucide-react";

import { signInWithGoogle } from "@/lib/auth";
import { getSafeErrorMessage } from "@/lib/errors";

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 18 18">
      <path
        d="M17.64 9.20455C17.64 8.56636 17.5827 7.95273 17.4764 7.36364H9V10.845H13.8436C13.635 11.97 13.0009 12.9232 12.0477 13.5614V15.8195H14.9564C16.6582 14.2527 17.64 11.9455 17.64 9.20455Z"
        fill="#4285F4"
      />
      <path
        d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5614C11.2418 14.1014 10.2109 14.4205 9 14.4205C6.65591 14.4205 4.67182 12.8373 3.96409 10.71H0.957275V13.0418C2.43818 15.9832 5.48182 18 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957275C0.347727 6.17318 0 7.54773 0 9C0 10.4523 0.347727 11.8268 0.957275 13.0418L3.96409 10.71Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65591 3.57955 9 3.57955Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const loginHint = searchParams.get("email") ?? undefined;
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setIsSigningIn(true);
    setErrorMessage(null);

    const result = await signInWithGoogle(loginHint).catch((error: unknown) => {
      setErrorMessage(getSafeErrorMessage(error, "Google sign-in failed. Please try again."));
      return null;
    });

    if (result) {
      router.push("/dashboard");
      return;
    }

    setIsSigningIn(false);
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-6 sm:p-7">
      <h2 className="font-[var(--font-public-sans)] text-xl font-semibold text-[var(--text)]">
        Sign in
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
        Please authenticate to access the admin console.
      </p>

      {loginHint && (
        <p className="mt-3 rounded border border-[var(--border)] bg-[var(--surface-high)] px-3 py-2 text-sm text-[var(--text)]">
          Signing in as <strong>{loginHint}</strong>
        </p>
      )}

      <button
        className="mt-7 flex min-h-12 w-full items-center justify-center gap-3 rounded border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold text-[#1f1f1f] transition hover:bg-[#f8fafd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffb3b3] disabled:cursor-not-allowed disabled:opacity-70"
        disabled={isSigningIn}
        onClick={() => void handleGoogleSignIn()}
        type="button"
      >
        <GoogleIcon />
        <span>{isSigningIn ? "Signing in..." : "Sign in with Google"}</span>
      </button>

      {errorMessage ? (
        <p className="mt-4 rounded border border-red-300/50 bg-red-300/10 px-3 py-2 text-sm text-red-100">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <section className="w-full max-w-[432px]">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] text-[#ffb3b3]">
            <Landmark aria-hidden="true" size={30} />
          </div>
          <h1 className="mt-5 font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
            Civic Calendar
          </h1>
          <p className="mt-2 font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted-warm)]">
            Administrative Secure Portal
          </p>
        </div>

        <Suspense fallback={
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-6 sm:p-7 text-center text-[var(--muted)]">
            Loading...
          </div>
        }>
          <LoginForm />
        </Suspense>
      </section>

      <footer className="fixed bottom-0 w-full border-t border-[var(--border)] bg-[var(--background)] py-4 text-center">
        <p className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
          Civic Infrastructure Systems
        </p>
      </footer>
    </main>
  );
}
