"use client";

import { CheckCircle2, XCircle } from "lucide-react";

import { StatusBadge } from "@/components/StatusBadge";
import type { AccessRequest } from "@/lib/accessRequests";
import { allowedRoles, type UserRole } from "@/lib/users";

type AccessRequestsPanelProps = {
  requests: AccessRequest[];
  selectedRoles: Record<string, UserRole>;
  isSaving: boolean;
  onChangeRole: (email: string, role: UserRole) => void;
  onApprove: (request: AccessRequest) => Promise<void>;
  onDeny: (request: AccessRequest) => Promise<void>;
};

function formatDate(value: AccessRequest["requestedAt"]) {
  if (!value) {
    return "Unknown";
  }

  return value.toDate().toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function AccessRequestsPanel({
  requests,
  selectedRoles,
  isSaving,
  onChangeRole,
  onApprove,
  onDeny,
}: AccessRequestsPanelProps) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)]">
      <div className="flex flex-col gap-2 border-b border-[var(--border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-[var(--font-public-sans)] text-xl font-semibold text-[var(--text)]">
            Access Requests
          </h2>
          <p className="text-sm text-[var(--muted)]">Review pending requests for Civic Calendar access.</p>
        </div>
        <span className="rounded border border-[var(--border)] px-2 py-1 font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
          {requests.length} pending
        </span>
      </div>

      {requests.length === 0 ? (
        <p className="p-6 text-sm text-[var(--muted)]">No pending access requests</p>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {requests.map((request) => (
            <article className="grid gap-4 p-4 lg:grid-cols-[1fr_180px_190px]" key={request.id}>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-[var(--font-public-sans)] text-base font-semibold text-[var(--text)]">
                    {request.displayName || "Unnamed requester"}
                  </h3>
                  <StatusBadge status={request.status} />
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">{request.email}</p>
                <p className="mt-2 text-sm text-[var(--text)]">
                  {request.message || "No message provided."}
                </p>
                <p className="mt-2 font-[var(--font-plex)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)]">
                  Requested {formatDate(request.requestedAt)}
                </p>
              </div>

              <label className="block">
                <span className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
                  Requested role
                </span>
                <select
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[#131313] px-3 py-2 text-sm text-[var(--text)]"
                  disabled={isSaving}
                  onChange={(event) => onChangeRole(request.email, event.target.value as UserRole)}
                  value={selectedRoles[request.email] ?? request.requestedRole}
                >
                  {allowedRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-end gap-2">
                <button
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded bg-[#a6192e] px-3 py-2 text-sm font-semibold text-white hover:bg-[#b42537] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSaving}
                  onClick={() => void onApprove(request)}
                  type="button"
                >
                  <CheckCircle2 aria-hidden="true" size={16} />
                  Approve
                </button>
                <button
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-high)] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSaving}
                  onClick={() => void onDeny(request)}
                  type="button"
                >
                  <XCircle aria-hidden="true" size={16} />
                  Deny
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
