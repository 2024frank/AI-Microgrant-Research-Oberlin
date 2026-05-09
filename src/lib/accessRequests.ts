import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";

import { firebaseDb } from "@/lib/firebase";
import { normalizeEmail, type UserRole } from "@/lib/users";

export type AccessRequestStatus = "pending" | "approved" | "denied";

export type AccessRequest = {
  id: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  requestedAt: Timestamp | null;
  status: AccessRequestStatus;
  requestedRole: UserRole;
  message: string;
  reviewedBy: string | null;
  reviewedAt: Timestamp | null;
};

function requestDocRef(email: string) {
  return doc(firebaseDb, "accessRequests", normalizeEmail(email));
}

function serializeAccessRequest(
  id: string,
  data: Record<string, unknown>,
): AccessRequest {
  return {
    id,
    email: typeof data.email === "string" ? data.email : id,
    displayName: typeof data.displayName === "string" ? data.displayName : null,
    photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
    requestedAt: (data.requestedAt as Timestamp | undefined) ?? null,
    status:
      data.status === "approved" || data.status === "denied" || data.status === "pending"
        ? data.status
        : "pending",
    requestedRole:
      data.requestedRole === "super_admin" ||
      data.requestedRole === "admin" ||
      data.requestedRole === "viewer" ||
      data.requestedRole === "reviewer"
        ? data.requestedRole
        : "reviewer",
    message: typeof data.message === "string" ? data.message : "",
    reviewedBy: typeof data.reviewedBy === "string" ? data.reviewedBy : null,
    reviewedAt: (data.reviewedAt as Timestamp | undefined) ?? null,
  };
}

export async function getAccessRequest(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const snapshot = await getDoc(requestDocRef(normalizedEmail));

  if (!snapshot.exists()) {
    return null;
  }

  return serializeAccessRequest(snapshot.id, snapshot.data());
}

export async function submitAccessRequest(input: {
  email: string;
  displayName?: string | null;
  photoURL?: string | null;
  message?: string;
}) {
  const email = normalizeEmail(input.email);
  const existing = await getAccessRequest(email);

  if (existing?.status === "pending") {
    return { request: existing, alreadyPending: true };
  }

  await setDoc(requestDocRef(email), {
    id: email,
    email,
    displayName: input.displayName ?? null,
    photoURL: input.photoURL ?? null,
    requestedAt: serverTimestamp(),
    status: "pending",
    requestedRole: "reviewer",
    message: input.message?.trim() ?? "",
    reviewedBy: null,
    reviewedAt: null,
  });

  const request = await getAccessRequest(email);
  return { request, alreadyPending: false };
}

export async function listPendingAccessRequests() {
  const snapshot = await getDocs(collection(firebaseDb, "accessRequests"));

  return snapshot.docs
    .map((requestDoc) => serializeAccessRequest(requestDoc.id, requestDoc.data()))
    .filter((request) => request.status === "pending")
    .sort((first, second) => {
      const firstTime = first.requestedAt?.toMillis() ?? 0;
      const secondTime = second.requestedAt?.toMillis() ?? 0;

      return secondTime - firstTime;
    });
}

export async function markAccessRequestReviewed(input: {
  email: string;
  status: "approved" | "denied";
  reviewedBy: string | null;
}) {
  await updateDoc(requestDocRef(input.email), {
    status: input.status,
    reviewedBy: input.reviewedBy,
    reviewedAt: serverTimestamp(),
  });
}
