"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

interface AllowedUser {
  email: string;
  role: string;
  addedAt: string;
  addedBy: string;
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function UsersPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AllowedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace("/dashboard");
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = onSnapshot(collection(db, "allowed_users"), (snap) => {
      const docs = snap.docs.map(d => d.data() as AllowedUser);
      docs.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
      setUsers(docs);
      setLoading(false);
    });
    return unsub;
  }, [isAdmin]);

  async function getIdToken() {
    if (!user) throw new Error("Not authenticated");
    return user.getIdToken();
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setAdding(true);
    try {
      const idToken = await getIdToken();
      const res = await fetch("/api/admin/add-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), idToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: "error", message: data.error || "Failed to add user" });
      } else {
        setStatus({ type: "success", message: `${email} can now sign in with Google.` });
        setEmail("");
      }
    } catch {
      setStatus({ type: "error", message: "Something went wrong. Try again." });
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(targetEmail: string) {
    setRemoving(targetEmail);
    setStatus(null);
    try {
      const idToken = await getIdToken();
      const res = await fetch("/api/admin/remove-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail, idToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: "error", message: data.error || "Failed to remove user" });
      }
    } catch {
      setStatus({ type: "error", message: "Something went wrong. Try again." });
    } finally {
      setRemoving(null);
    }
  }

  if (authLoading || !isAdmin) return null;

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-white text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Manage who can access the dashboard. Added users can sign in with their Google account.
        </p>
      </div>

      {/* Add user form */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-6 mb-8">
        <p className="text-white text-sm font-semibold mb-4">Add a user (Gmail address)</p>
        <form onSubmit={handleAdd} className="flex gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="colleague@gmail.com"
            className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-[#C8102E] focus:border-[#C8102E] transition"
          />
          <button
            type="submit"
            disabled={adding}
            className="bg-[#C8102E] hover:bg-[#a50d26] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg px-5 py-2.5 transition shrink-0"
          >
            {adding ? "Adding…" : "Add user"}
          </button>
        </form>

        {status && (
          <p className={`mt-3 text-sm px-3.5 py-2.5 rounded-lg border ${
            status.type === "success"
              ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
              : "text-red-400 bg-red-400/10 border-red-400/20"
          }`}>
            {status.message}
          </p>
        )}
      </div>

      {/* User list */}
      <div>
        <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide mb-3">
          Authorized accounts ({loading ? "…" : users.length + 1})
        </p>

        {/* Admin row (always first) */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl px-5 py-3.5 flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-[#C8102E]/20 flex items-center justify-center text-[#C8102E] text-xs font-bold uppercase shrink-0">
              {user?.email?.[0]}
            </div>
            <div>
              <p className="text-white text-sm">{user?.email}</p>
              <p className="text-zinc-600 text-xs">you</p>
            </div>
          </div>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full border text-[#C8102E] bg-[#C8102E]/10 border-[#C8102E]/20">
            Admin
          </span>
        </div>

        {!loading && users.filter(u => u.email !== user?.email).map((u) => (
          <div key={u.email} className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-5 py-3.5 flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-white/[0.07] flex items-center justify-center text-zinc-400 text-xs font-bold uppercase shrink-0">
                {u.email[0]}
              </div>
              <div>
                <p className="text-zinc-300 text-sm">{u.email}</p>
                <p className="text-zinc-600 text-xs">Added {timeAgo(u.addedAt)}</p>
              </div>
            </div>
            <button
              onClick={() => handleRemove(u.email)}
              disabled={removing === u.email}
              className="text-xs text-zinc-500 hover:text-red-400 border border-white/[0.06] hover:border-red-400/30 px-3 py-1.5 rounded-lg transition disabled:opacity-40"
            >
              {removing === u.email ? "Removing…" : "Remove"}
            </button>
          </div>
        ))}

        {!loading && users.filter(u => u.email !== user?.email).length === 0 && (
          <p className="text-zinc-600 text-sm text-center py-6">No other users yet. Add one above.</p>
        )}
      </div>
    </div>
  );
}
