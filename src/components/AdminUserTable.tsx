import { useState } from "react";

import { StatusBadge } from "@/components/StatusBadge";
import {
  allowedRoles,
  allowedStatuses,
  bootstrapSuperAdminEmail,
  type AuthorizedUser,
  type UserRole,
  type UserStatus,
} from "@/lib/users";

type AdminUserTableProps = {
  users: AuthorizedUser[];
  onUpdateUser: (
    email: string,
    updates: Partial<Pick<AuthorizedUser, "role" | "status">>,
  ) => Promise<void>;
  onDeleteUser?: (email: string) => Promise<void>;
  isSaving: boolean;
};

function formatDate(value: AuthorizedUser["lastLoginAt"]) {
  if (!value) {
    return "Not yet";
  }

  return value.toDate().toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function AdminUserTable({ users, onUpdateUser, onDeleteUser, isSaving }: AdminUserTableProps) {
  const [confirmDeleteEmail, setConfirmDeleteEmail] = useState<string | null>(null);

  if (!users.length) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-6 text-sm text-[var(--muted)]">
        No authorized users found.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)]">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-[var(--surface-high)]">
            <tr>
              {["User", "Role", "Status", "Last Login", "Actions"].map((header) => (
                <th
                  className="border-b border-[var(--border)] px-4 py-2 font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]"
                  key={header}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr className="border-b border-[var(--border)] last:border-b-0" key={user.email}>
                <td className="px-4 py-3">
                  <p className="font-semibold text-[var(--text)]">
                    {user.displayName || "Unnamed user"}
                  </p>
                  <p className="text-xs text-[var(--muted)]">{user.email}</p>
                  {user.uid ? <p className="text-xs text-[var(--muted)]">UID: {user.uid}</p> : null}
                </td>
                <td className="px-4 py-3">
                  <select
                    className="rounded border border-[var(--border)] bg-[#131313] px-2 py-1 text-sm text-[var(--text)]"
                    disabled={isSaving}
                    onChange={(event) =>
                      void onUpdateUser(user.email, { role: event.target.value as UserRole })
                    }
                    value={user.role}
                  >
                    {allowedRoles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-2">
                    <StatusBadge status={user.status} />
                    <select
                      className="rounded border border-[var(--border)] bg-[#131313] px-2 py-1 text-sm text-[var(--text)]"
                      disabled={isSaving}
                      onChange={(event) =>
                        void onUpdateUser(user.email, { status: event.target.value as UserStatus })
                      }
                      value={user.status}
                    >
                      {allowedStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">{formatDate(user.lastLoginAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--surface-high)] disabled:opacity-60"
                      disabled={isSaving || user.status === "disabled"}
                      onClick={() => void onUpdateUser(user.email, { status: "disabled" })}
                      type="button"
                    >
                      Disable
                    </button>
                    <button
                      className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--surface-high)] disabled:opacity-60"
                      disabled={isSaving || user.status === "active"}
                      onClick={() => void onUpdateUser(user.email, { status: "active" })}
                      type="button"
                    >
                      Reactivate
                    </button>
                    {onDeleteUser && user.email !== bootstrapSuperAdminEmail && (
                      <button
                        className="rounded border border-[#82303b] px-2 py-1 text-xs text-[#ffb3b3] hover:bg-[#82303b]/20 disabled:opacity-60"
                        disabled={isSaving}
                        onClick={() => setConfirmDeleteEmail(user.email)}
                        type="button"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmDeleteEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <section className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
            <h2 className="font-[var(--font-public-sans)] text-xl font-semibold text-[var(--text)]">Remove user</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Permanently remove <strong className="text-[var(--text)]">{confirmDeleteEmail}</strong> from the platform? They will lose all access and need to be re-invited.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-high)]"
                onClick={() => setConfirmDeleteEmail(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded bg-[#a6192e] px-3 py-2 text-sm font-semibold text-white hover:bg-[#b42537]"
                disabled={isSaving}
                onClick={() => {
                  void onDeleteUser?.(confirmDeleteEmail).then(() => setConfirmDeleteEmail(null));
                }}
                type="button"
              >
                Delete User
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
