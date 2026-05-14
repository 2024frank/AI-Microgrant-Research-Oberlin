"use client";

import { getClientJsonAuthHeaders } from "@/lib/clientAuthHeaders";

type SendEmailInput =
  | {
      type: "access-approved";
      to: string;
      displayName?: string | null;
    }
  | {
      type: "invite-user";
      to: string;
      role: string;
      displayName?: string | null;
    };

export async function sendEmail(input: SendEmailInput) {
  const response = await fetch("/api/email", {
    method: "POST",
    headers: await getClientJsonAuthHeaders(),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(result?.error ?? "Email request failed.");
  }
}
