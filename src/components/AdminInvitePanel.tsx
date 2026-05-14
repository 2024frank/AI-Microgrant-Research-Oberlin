"use client";

import { useState } from "react";
import { MailPlus } from "lucide-react";

import { allowedRoles, allowedStatuses, type UserRole, type UserStatus } from "@/lib/users";

type AdminInvitePanelProps = {
  onCreateUser: (input: {
    email: string;
    displayName?: string;
    role: UserRole;
    status: UserStatus;
  }) => Promise<void>;
  isSaving: boolean;
};

export function AdminInvitePanel({ onCreateUser, isSaving }: AdminInvitePanelProps) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("reviewer");
  const [status, setStatus] = useState<UserStatus>("pending");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreateUser({ email, displayName, role, status });
    setEmail("");
    setDisplayName("");
    setRole("reviewer");
    setStatus("pending");
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded bg-[var(--primary-soft)] text-[#ffdad9]">
          <MailPlus aria-hidden="true" size={20} />
        </div>
        <div>
          <h2 className="font-[var(--font-public-sans)] text-lg font-semibold text-[var(--text)]">
            Add Authorized User
          </h2>
          <p className="text-sm text-[var(--muted)]">MySQL-backed user access (DigitalOcean).</p>
        </div>
      </div>
      <form className="mt-4 space-y-3" onSubmit={(event) => void handleSubmit(event)}>
        <label className="block">
          <span className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
            Email
          </span>
          <input
            className="mt-1 w-full rounded border border-[var(--border)] bg-[#131313] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-slate-500 focus:border-[#a6192e]"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="reviewer@oberlin.example"
            required
            type="email"
            value={email}
          />
        </label>
        <label className="block">
          <span className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
            Display name
          </span>
          <input
            className="mt-1 w-full rounded border border-[var(--border)] bg-[#131313] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-slate-500 focus:border-[#a6192e]"
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Optional"
            type="text"
            value={displayName}
          />
        </label>
        <label className="block">
          <span className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
            Role
          </span>
          <select
            className="mt-1 w-full rounded border border-[var(--border)] bg-[#131313] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[#a6192e]"
            onChange={(event) => setRole(event.target.value as UserRole)}
            required
            value={role}
          >
            {allowedRoles.map((nextRole) => (
              <option key={nextRole} value={nextRole}>
                {nextRole}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
            Status
          </span>
          <select
            className="mt-1 w-full rounded border border-[var(--border)] bg-[#131313] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[#a6192e]"
            onChange={(event) => setStatus(event.target.value as UserStatus)}
            required
            value={status}
          >
            {allowedStatuses.map((nextStatus) => (
              <option key={nextStatus} value={nextStatus}>
                {nextStatus}
              </option>
            ))}
          </select>
        </label>
        <button
          className="w-full rounded bg-[#a6192e] px-3 py-2 font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-white hover:bg-[#b42537] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSaving}
          type="submit"
        >
          {isSaving ? "Saving..." : "Authorize User"}
        </button>
      </form>
    </section>
  );
}
