"use client";

import { useEffect, useState } from "react";

import { AccessRequestsPanel } from "@/components/AccessRequestsPanel";
import { AdminInvitePanel } from "@/components/AdminInvitePanel";
import { AdminUserTable } from "@/components/AdminUserTable";
import { useAuth } from "@/context/AuthContext";
import {
  listPendingAccessRequests,
  markAccessRequestReviewed,
  type AccessRequest,
} from "@/lib/accessRequests";
import { sendEmail } from "@/lib/emailClient";
import { getSafeErrorMessage } from "@/lib/errors";
import {
  createAuthorizedUser,
  deleteAuthorizedUser,
  listAuthorizedUsers,
  updateAuthorizedUser,
  type AuthorizedUser,
  type UserRole,
  type UserStatus,
  canAccessAdminControl,
} from "@/lib/users";

export default function AdminControlPage() {
  const { user, refreshUserAccess, role } = useAuth();
  const [users, setUsers] = useState<AuthorizedUser[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [selectedRequestRoles, setSelectedRequestRoles] = useState<Record<string, UserRole>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [processedIdCount, setProcessedIdCount] = useState<number | null>(null);
  const [processedLoading, setProcessedLoading] = useState(false);
  const [processedClearing, setProcessedClearing] = useState(false);
  const showPipelineTools = role != null && canAccessAdminControl(role);
  const invitedUsers = users.filter((authorizedUser) => authorizedUser.status === "pending");

  async function loadUsers() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const nextUsers = await listAuthorizedUsers();
      const nextRequests = await listPendingAccessRequests();
      setUsers(nextUsers);
      setAccessRequests(nextRequests);
      setSelectedRequestRoles(
        Object.fromEntries(nextRequests.map((request) => [request.email, request.requestedRole])),
      );
    } catch (error) {
      setErrorMessage(getSafeErrorMessage(error, "Unable to load authorized users."));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function loadProcessedEventIdCount() {
    if (!user || !showPipelineTools) return;
    setProcessedLoading(true);
    try {
      const res = await fetch("/api/admin/processed-event-ids", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      if (!res.ok) {
        setProcessedIdCount(null);
        return;
      }
      const data = (await res.json()) as { count?: number };
      setProcessedIdCount(typeof data.count === "number" ? data.count : null);
    } catch {
      setProcessedIdCount(null);
    } finally {
      setProcessedLoading(false);
    }
  }

  useEffect(() => {
    if (user && showPipelineTools) void loadProcessedEventIdCount();
  }, [user, showPipelineTools]);

  async function handleCreateUser(input: {
    email: string;
    displayName?: string;
    role: UserRole;
    status: UserStatus;
  }) {
    setIsSaving(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      await createAuthorizedUser({
        ...input,
        invitedBy: user?.email ?? null,
      });
      await sendEmail({
        type: "invite-user",
        to: input.email,
        role: input.role,
        displayName: input.displayName,
      });
      await loadUsers();
      setMessage("Authorized user saved and invitation email sent.");
    } catch (error) {
      setErrorMessage(getSafeErrorMessage(error, "Unable to create user."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleApproveRequest(request: AccessRequest) {
    setIsSaving(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const role = selectedRequestRoles[request.email] ?? request.requestedRole;
      await createAuthorizedUser({
        email: request.email,
        displayName: request.displayName ?? undefined,
        photoURL: request.photoURL,
        role,
        status: "active",
        invitedBy: user?.email ?? null,
      });
      await markAccessRequestReviewed({
        email: request.email,
        status: "approved",
        reviewedBy: user?.email ?? null,
      });
      await sendEmail({
        type: "access-approved",
        to: request.email,
        displayName: request.displayName,
      });
      await loadUsers();
      setMessage("Access request approved and approval email sent.");
    } catch (error) {
      setErrorMessage(getSafeErrorMessage(error, "Unable to approve request."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDenyRequest(request: AccessRequest) {
    setIsSaving(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      await markAccessRequestReviewed({
        email: request.email,
        status: "denied",
        reviewedBy: user?.email ?? null,
      });
      await loadUsers();
      setMessage("Access request denied.");
    } catch (error) {
      setErrorMessage(getSafeErrorMessage(error, "Unable to deny request."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdateUser(
    email: string,
    updates: Partial<Pick<AuthorizedUser, "role" | "status">>,
  ) {
    setIsSaving(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      await updateAuthorizedUser(email, updates);
      await loadUsers();
      await refreshUserAccess();
      setMessage("User access updated.");
    } catch (error) {
      setErrorMessage(getSafeErrorMessage(error, "Unable to update user."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteUser(email: string) {
    setIsSaving(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      await deleteAuthorizedUser(email);
      await loadUsers();
      setMessage(`User ${email} has been removed.`);
    } catch (error) {
      setErrorMessage(getSafeErrorMessage(error, "Unable to delete user."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClearProcessedEventIds() {
    if (!user || !showPipelineTools) return;
    const ok = window.confirm(
      "Clear all processed Localist event IDs from MySQL? The pipeline will treat every event as new (it may create duplicates in review unless you also clear review posts).",
    );
    if (!ok) return;

    setProcessedClearing(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/admin/processed-event-ids", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; deleted?: number };
      if (!res.ok) {
        setErrorMessage(data.error ?? "Unable to clear processed event IDs.");
        return;
      }
      setMessage(
        `Cleared processed Localist IDs (${data.deleted ?? 0} rows removed from MySQL).`,
      );
      await loadProcessedEventIdCount();
    } catch (error) {
      setErrorMessage(getSafeErrorMessage(error, "Unable to clear processed event IDs."));
    } finally {
      setProcessedClearing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
          Admin Control Center
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          MySQL-backed user access, role management, and access control.
        </p>
      </div>
      {message ? (
        <p className="rounded border border-teal-300/40 bg-teal-300/10 px-4 py-3 text-sm text-teal-100">
          {message}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="rounded border border-red-300/40 bg-red-300/10 px-4 py-3 text-sm text-red-100">
          {errorMessage}
        </p>
      ) : null}
      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
              <p className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
                Pending Requests
              </p>
              <p className="mt-2 font-[var(--font-public-sans)] text-3xl font-bold text-[var(--text)]">
                {accessRequests.length}
              </p>
            </section>
            <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
              <p className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
                Authorized Users
              </p>
              <p className="mt-2 font-[var(--font-public-sans)] text-3xl font-bold text-[var(--text)]">
                {users.length}
              </p>
            </section>
          </div>
          {showPipelineTools ? (
            <section
              aria-labelledby="pipeline-dedupe-heading"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4"
            >
              <h2
                id="pipeline-dedupe-heading"
                className="font-[var(--font-public-sans)] text-lg font-semibold text-[var(--text)]"
              >
                Pipeline — deduplication (MySQL)
              </h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                The pipeline skips events whose Localist IDs are stored in{" "}
                <code className="rounded bg-[var(--surface)] px-1 py-0.5 text-xs">processed_event_ids</code>.
                Clearing this table lets you re-run ingestion without touching review posts or sources.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <p className="text-sm text-[var(--text)]" aria-live="polite">
                  {processedLoading ? (
                    <span className="text-[var(--muted)]">Loading count…</span>
                  ) : processedIdCount === null ? (
                    <span className="text-[var(--muted)]">Could not load count.</span>
                  ) : (
                    <>
                      <span className="font-semibold">{processedIdCount}</span> processed Localist
                      event ID{processedIdCount === 1 ? "" : "s"} in MySQL
                    </>
                  )}
                </p>
                <button
                  type="button"
                  className="rounded-md border border-amber-400/50 bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-500/25 disabled:opacity-50"
                  disabled={processedClearing || processedLoading}
                  onClick={() => void handleClearProcessedEventIds()}
                >
                  {processedClearing ? "Clearing…" : "Clear processed event IDs"}
                </button>
                <button
                  type="button"
                  className="text-sm text-[var(--muted)] underline-offset-2 hover:underline"
                  disabled={processedLoading || processedClearing}
                  onClick={() => void loadProcessedEventIdCount()}
                >
                  Refresh count
                </button>
              </div>
            </section>
          ) : null}
          <AccessRequestsPanel
            isSaving={isSaving}
            onApprove={handleApproveRequest}
            onChangeRole={(email, role) =>
              setSelectedRequestRoles((current) => ({ ...current, [email]: role }))
            }
            onDeny={handleDenyRequest}
            requests={accessRequests}
            selectedRoles={selectedRequestRoles}
          />
          <div>
            <h2 className="mb-3 font-[var(--font-public-sans)] text-xl font-semibold">User Directory</h2>
            {isLoading ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-6 text-sm text-[var(--muted)]">
                Loading authorized users...
              </div>
            ) : (
              <AdminUserTable
                isSaving={isSaving}
                onUpdateUser={handleUpdateUser}
                onDeleteUser={handleDeleteUser}
                users={users}
              />
            )}
          </div>
          <div>
            <h2 className="mb-3 font-[var(--font-public-sans)] text-xl font-semibold">Invited Users</h2>
            {invitedUsers.length === 0 ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-6 text-sm text-[var(--muted)]">
                No invited users yet.
              </div>
            ) : (
              <AdminUserTable
                isSaving={isSaving}
                onUpdateUser={handleUpdateUser}
                onDeleteUser={handleDeleteUser}
                users={invitedUsers}
              />
            )}
          </div>
        </div>
        <AdminInvitePanel isSaving={isSaving} onCreateUser={handleCreateUser} />
      </section>
    </div>
  );
}
