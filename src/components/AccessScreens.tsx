"use client";

import Link from "next/link";
import { useState } from "react";
import { ShieldAlert } from "lucide-react";

import { signOutUser } from "@/lib/auth";
import { submitAccessRequest } from "@/lib/accessRequests";
import { getSafeErrorMessage } from "@/lib/errors";
import type { UserStatus } from "@/lib/users";

type UnauthorizedScreenProps = {
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  status?: UserStatus | "unknown" | null;
};

export function UnauthorizedScreen({ email, displayName, photoURL, status }: UnauthorizedScreenProps) {
  const [requestMessage, setRequestMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isDisabled = status === "disabled";
  const title = isDisabled ? "Access Disabled" : "Access Pending";
  const message = isDisabled
    ? "Your Civic Calendar access has been disabled. Contact an administrator if this seems incorrect."
    : "Your account is not currently authorized to use Civic Calendar.";

  async function handleRequestAccess() {
    if (!email || isDisabled) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await submitAccessRequest({
        email,
        displayName,
        photoURL,
        message: requestMessage,
      });

      setSuccessMessage(
        result.alreadyPending
          ? "You already have a pending access request. A platform administrator will review your request."
          : "Access request submitted. A platform administrator will review your request.",
      );
    } catch (error) {
      setErrorMessage(getSafeErrorMessage(error, "Unable to submit access request."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <section className="w-full max-w-lg rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-6 text-center">
        <ShieldAlert aria-hidden="true" className="mx-auto text-[#ffb4ab]" size={40} />
        <h1 className="mt-4 font-[var(--font-public-sans)] text-2xl font-bold text-[var(--text)]">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          {message}
        </p>
        {email ? (
          <p className="mt-3 rounded border border-[var(--border)] bg-[#131313] px-3 py-2 text-sm text-[var(--text)]">
            Signed in as {email}
          </p>
        ) : null}
        {!isDisabled ? (
          <div className="mt-5 space-y-3 text-left">
            <label className="block">
              <span className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
                Message optional
              </span>
              <textarea
                className="mt-1 min-h-24 w-full rounded border border-[var(--border)] bg-[#131313] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-slate-500 focus:border-[#a6192e]"
                onChange={(event) => setRequestMessage(event.target.value)}
                placeholder="Tell the administrator why you need access."
                value={requestMessage}
              />
            </label>
            {successMessage ? (
              <p className="rounded border border-teal-300/40 bg-teal-300/10 px-3 py-2 text-sm text-teal-100">
                {successMessage}
              </p>
            ) : null}
            {errorMessage ? (
              <p className="rounded border border-red-300/40 bg-red-300/10 px-3 py-2 text-sm text-red-100">
                {errorMessage}
              </p>
            ) : null}
            <button
              className="w-full rounded bg-[#a6192e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b42537] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              onClick={() => void handleRequestAccess()}
              type="button"
            >
              {isSubmitting ? "Submitting..." : "Request Access"}
            </button>
          </div>
        ) : null}
        <button
          className="mt-4 rounded border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-high)]"
          onClick={() => void signOutUser()}
          type="button"
        >
          Sign Out
        </button>
      </section>
    </main>
  );
}

export function AccessDeniedScreen() {
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center text-center">
      <ShieldAlert aria-hidden="true" className="text-[#ffb4ab]" size={40} />
      <h1 className="mt-4 font-[var(--font-public-sans)] text-2xl font-bold text-[var(--text)]">
        Access Denied
      </h1>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
        Your role does not allow access to this section.
      </p>
      <Link
        className="mt-5 rounded bg-[#a6192e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b42537]"
        href="/dashboard"
      >
        Back to Dashboard
      </Link>
    </section>
  );
}
