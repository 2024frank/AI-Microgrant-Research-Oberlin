import type { UserRole } from "./users";
import { firebaseAuth } from "./firebase";
import { normalizeEmail } from "./userIds";

export type AccessRequestStatus = "pending" | "approved" | "denied";

export type AccessRequest = {
  id: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  requestedAt: number | null;
  status: AccessRequestStatus;
  requestedRole: UserRole;
  message: string;
  reviewedBy: string | null;
  reviewedAt: number | null;
};

function rowToAccessRequest(row: AccessRequest): AccessRequest {
  return row;
}

async function bearer(user: NonNullable<typeof firebaseAuth.currentUser>) {
  return { Authorization: `Bearer ${await user.getIdToken()}` } as const;
}

export async function getAccessRequest(email: string): Promise<AccessRequest | null> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Not signed in");
  const res = await fetch(
    `/api/admin/access-requests?email=${encodeURIComponent(normalizeEmail(email))}`,
    { headers: await bearer(user) },
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Unable to load access request");
  }
  const data = (await res.json()) as { request: AccessRequest | null };
  return data.request ? rowToAccessRequest(data.request) : null;
}

export async function submitAccessRequest(input: {
  email: string;
  displayName?: string | null;
  photoURL?: string | null;
  message?: string;
}) {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Not signed in");
  if (!user.email || normalizeEmail(input.email) !== normalizeEmail(user.email)) {
    throw new Error("Signed-in email does not match access request.");
  }
  const res = await fetch("/api/access-requests", {
    method: "POST",
    headers: { ...await bearer(user), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: input.message,
      displayName: input.displayName,
      photoURL: input.photoURL,
    }),
  });
  const data = (await res.json()) as {
    request?: AccessRequest;
    alreadyPending?: boolean;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? "Unable to submit access request");
  }
  return {
    request: data.request ? rowToAccessRequest(data.request) : null,
    alreadyPending: Boolean(data.alreadyPending),
  };
}

export async function listPendingAccessRequests(): Promise<AccessRequest[]> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Not signed in");
  const res = await fetch("/api/admin/access-requests", { headers: await bearer(user) });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Unable to load access requests");
  }
  const data = (await res.json()) as { requests: AccessRequest[] };
  return data.requests;
}

export async function markAccessRequestReviewed(input: {
  email: string;
  status: "approved" | "denied";
  reviewedBy: string | null;
}) {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Not signed in");
  const res = await fetch("/api/admin/access-requests", {
    method: "PATCH",
    headers: { ...await bearer(user), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Unable to update access request");
  }
}
