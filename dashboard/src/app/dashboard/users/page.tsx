"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth, ADMIN_EMAIL } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

interface AllowedUser {
  email: string;
  role: string;
  addedAt: string;
  addedBy: string;
}

interface ActivityEntry {
  id: string;
  user: string;
  action: string;
  label: string;
  details: string;
  timestamp: string;
}

function timeAgo(iso: string) {
  if (!iso) return "never";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const ACTION_COLOR: Record<string, string> = {
  approved_event:       "text-emerald-400",
  rejected_event:       "text-red-400",
  overrode_private:     "text-amber-400",
  confirmed_duplicate:  "text-purple-400",
  rejected_duplicate:   "text-zinc-400",
  added_user:           "text-blue-400",
  removed_user:         "text-red-400",
  signed_in:            "text-zinc-500",
};

export default function UsersPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AllowedUser[]>([]);
  const [lastLogins, setLastLogins] = useState<Record<string, string>>({});
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"users" | "activity">("users");

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace("/dashboard");
  }, [authLoading, isAdmin, router]);

  // Load users from allowed_users
  useEffect(() => {
    if (!isAdmin) return;
    const unsub = onSnapshot(collection(db, "allowed_users"), async (snap) => {
      const docs = snap.docs.map(d => d.data() as AllowedUser);
      docs.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
      setUsers(docs);
      setLoading(false);

      // Fetch lastLogin for each user + admin
      const emails = [...docs.map(d => d.email), ADMIN_EMAIL];
      const logins: Record<string, string> = {};
      await Promise.all(emails.map(async (em) => {
        try {
          const snap = await getDoc(doc(db, "user_activity", em));
          if (snap.exists()) logins[em] = snap.data().lastLogin ?? "";
        } catch { /* skip */ }
      }));
      setLastLogins(logins);
    });
    return unsub;
  }, [isAdmin]);

  // Live activity log
  useEffect(() => {
    if (!isAdmin) return;
    const unsub = onSnapshot(collection(db, "activity_log"), (snap) => {
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as ActivityEntry))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setActivity(docs);
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

  const allUsers = [
    { email: ADMIN_EMAIL, isAdmin: true } as { email: string; isAdmin: boolean },
    ...users.filter(u => u.email !== ADMIN_EMAIL).map(u => ({ ...u, isAdmin: false })),
  ];

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold tracking-tight">Users & Activity</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Manage access, see who is logged in, and track every action taken in the dashboard.
          </p>
        </div>
        {activity.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-medium bg-emerald-400/10 border border-emerald-400/20 rounded-full px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {activity.length} actions logged
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white/[0.03] border border-white/[0.07] rounded-lg p-1 w-fit">
        {(["users", "activity"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
              activeTab === tab ? "bg-white/[0.08] text-white" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab === "users" ? "Users" : `Activity ${activity.length > 0 ? `(${activity.length})` : ""}`}
          </button>
        ))}
      </div>

      {activeTab === "users" && (
        <>
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

          {/* User list with last login */}
          <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide mb-3">
            Authorized accounts ({loading ? "…" : allUsers.length})
          </p>

          <div className="space-y-2">
            {allUsers.map(u => {
              const lastLogin = lastLogins[u.email];
              const userActivity = activity.filter(a => a.user === u.email);
              return (
                <div key={u.email} className="bg-white/[0.03] border border-white/[0.07] rounded-xl px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold uppercase shrink-0 ${
                        u.isAdmin ? "bg-[#C8102E]/20 text-[#C8102E]" : "bg-white/[0.07] text-zinc-400"
                      }`}>
                        {u.email[0]}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-white text-sm font-medium truncate">{u.email}</p>
                          {u.isAdmin && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border text-[#C8102E] bg-[#C8102E]/10 border-[#C8102E]/20 shrink-0">
                              Admin
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <p className="text-zinc-600 text-xs">
                            Last login: <span className={lastLogin ? "text-zinc-400" : "text-zinc-700"}>
                              {lastLogin ? timeAgo(lastLogin) : "never recorded"}
                            </span>
                          </p>
                          {userActivity.length > 0 && (
                            <p className="text-zinc-600 text-xs">
                              {userActivity.length} action{userActivity.length > 1 ? "s" : ""}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    {!u.isAdmin && (
                      <button
                        onClick={() => handleRemove(u.email)}
                        disabled={removing === u.email}
                        className="text-xs text-zinc-500 hover:text-red-400 border border-white/[0.06] hover:border-red-400/30 px-3 py-1.5 rounded-lg transition disabled:opacity-40 shrink-0"
                      >
                        {removing === u.email ? "Removing…" : "Remove"}
                      </button>
                    )}
                  </div>

                  {/* Last 3 actions for this user */}
                  {userActivity.slice(0, 3).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/[0.05] space-y-1">
                      {userActivity.slice(0, 3).map(a => (
                        <div key={a.id} className="flex items-center gap-2">
                          <span className={`text-[10px] font-medium w-1.5 h-1.5 rounded-full shrink-0 ${ACTION_COLOR[a.action] ?? "text-zinc-500"}`} style={{ background: "currentColor" }} />
                          <p className="text-zinc-500 text-xs flex-1 truncate">{a.label}</p>
                          <p className="text-zinc-700 text-[10px] shrink-0">{timeAgo(a.timestamp)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {activeTab === "activity" && (
        <div className="bg-white/[0.02] border border-white/[0.07] rounded-xl overflow-hidden">
          {activity.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <p className="text-zinc-600 text-sm">No activity recorded yet.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[auto_1fr_auto] gap-4 px-5 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
                <p className="text-zinc-600 text-[10px] font-semibold uppercase tracking-wide">User</p>
                <p className="text-zinc-600 text-[10px] font-semibold uppercase tracking-wide">Action</p>
                <p className="text-zinc-600 text-[10px] font-semibold uppercase tracking-wide">When</p>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {activity.map(a => (
                  <div key={a.id} className="grid grid-cols-[auto_1fr_auto] gap-4 px-5 py-3 items-center hover:bg-white/[0.02] transition">
                    <div className="w-6 h-6 rounded-full bg-white/[0.07] flex items-center justify-center text-[10px] font-bold uppercase text-zinc-400 shrink-0">
                      {a.user[0]}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${ACTION_COLOR[a.action] ?? "text-zinc-300"}`}>
                        {a.label}
                      </p>
                      <p className="text-zinc-600 text-xs truncate">{a.user}</p>
                    </div>
                    <p className="text-zinc-600 text-xs shrink-0 tabular-nums">{timeAgo(a.timestamp)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
