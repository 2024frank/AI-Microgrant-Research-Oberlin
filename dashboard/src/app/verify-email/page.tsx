"use client";

import { useEffect, useState } from "react";
import { isSignInWithEmailLink, signInWithEmailLink, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { ADMIN_EMAIL } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    async function completeSignIn() {
      if (!isSignInWithEmailLink(auth, window.location.href)) {
        router.replace("/login");
        return;
      }

      let email = localStorage.getItem("emailForSignIn");
      if (!email) {
        email = window.prompt("Please enter your email to confirm sign-in:");
      }
      if (!email) {
        setError("Email is required to complete sign-in.");
        return;
      }

      try {
        const cred = await signInWithEmailLink(auth, email, window.location.href);
        localStorage.removeItem("emailForSignIn");

        if (cred.user.email !== ADMIN_EMAIL) {
          const snap = await getDoc(doc(db, "allowed_users", cred.user.email!));
          if (!snap.exists()) {
            await signOut(auth);
            setError("This account is not authorized to access the dashboard.");
            return;
          }
        }

        router.replace("/dashboard");
      } catch {
        setError("This sign-in link is invalid or has expired. Please request a new one.");
      }
    }

    completeSignIn();
  }, [router]);

  return (
    <main className="min-h-screen bg-[#1a0000] flex items-center justify-center px-4">
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <div className="w-[600px] h-[600px] rounded-full bg-[#C8102E]/10 blur-[120px]" />
      </div>

      <div className="relative text-center">
        {error ? (
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-8 max-w-sm">
            <p className="text-red-400 text-sm mb-4">{error}</p>
            <button
              onClick={() => router.replace("/login")}
              className="text-[#C8102E] hover:text-[#e8102e] text-sm font-medium transition"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-[#C8102E]/30 border-t-[#C8102E] animate-spin" />
            <p className="text-zinc-400 text-sm">Signing you in…</p>
          </div>
        )}
      </div>
    </main>
  );
}
