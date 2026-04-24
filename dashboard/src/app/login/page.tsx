"use client";

import { useState } from "react";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { ADMIN_EMAIL } from "@/context/AuthContext";

const provider = new GoogleAuthProvider();

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleGoogleSignIn() {
    setError("");
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, provider);
      const email = result.user.email ?? "";
      if (email !== ADMIN_EMAIL) {
        const snap = await getDoc(doc(db, "allowed_users", email));
        if (!snap.exists()) {
          await auth.signOut();
          setError("This Google account is not authorized to access the dashboard.");
          setLoading(false);
          return;
        }
      }
      router.push("/dashboard");
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === "auth/popup-closed-by-user") { setLoading(false); return; }
      setError(`Sign-in failed: ${e.code ?? e.message ?? String(err)}`);
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#1a0000] flex items-center justify-center px-4">
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <div className="w-[600px] h-[600px] rounded-full bg-[#C8102E]/10 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#C8102E] mb-4 shadow-lg shadow-[#C8102E]/30">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
          </div>
          <h1 className="text-white text-2xl font-bold tracking-tight">Oberlin Calendar</h1>
          <p className="text-[#C8102E]/70 text-sm font-medium mt-1">Research Dashboard</p>
        </div>

        <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-8 backdrop-blur-sm">
          <p className="text-white font-semibold text-lg mb-1">Sign in</p>
          <p className="text-zinc-500 text-sm mb-6">
            Use your authorized Google account to access the dashboard.
          </p>

          {error && (
            <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3.5 py-2.5 mb-4">
              {error}
            </p>
          )}

          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-800 font-medium text-sm rounded-lg py-2.5 transition shadow-md"
          >
            {loading ? (
              <svg className="w-5 h-5 animate-spin text-zinc-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            {loading ? "Signing in…" : "Sign in with Google"}
          </button>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">
          Oberlin College · AI Micro-Grant Research · {new Date().getFullYear()}
        </p>
      </div>
    </main>
  );
}
