"use client";

import { getClientBearerAuthHeader, getClientJsonAuthHeaders } from "@/lib/clientAuthHeaders";

export type ChatMessage = {
  id: string;
  text: string;
  senderEmail: string;
  senderName: string;
  senderPhoto: string | null;
  mentions: string[];
  /** Epoch milliseconds (from MySQL-backed API). */
  createdAt: number | null;
};

export async function sendChatMessage(msg: {
  text: string;
  mentions: string[];
}) {
  const res = await fetch("/api/team-chat", {
    method: "POST",
    headers: await getClientJsonAuthHeaders(),
    body: JSON.stringify({ text: msg.text, mentions: msg.mentions }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.error === "string" ? err.error : "Failed to send message");
  }

  if (msg.mentions.length > 0) {
    await fetch("/api/chat/notify", {
      method: "POST",
      headers: await getClientJsonAuthHeaders(),
      body: JSON.stringify({
        text: msg.text,
        mentions: msg.mentions,
      }),
    }).catch(() => {});
  }
}

export function subscribeToChatMessages(count: number, callback: (messages: ChatMessage[]) => void) {
  let cancelled = false;

  async function pull() {
    try {
      const res = await fetch(`/api/team-chat?limit=${encodeURIComponent(String(count))}`, {
        cache: "no-store",
        headers: await getClientBearerAuthHeader(),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { messages?: ChatMessage[] };
      if (!cancelled && Array.isArray(data.messages)) {
        callback(data.messages);
      }
    } catch {
      /* ignore transient network errors */
    }
  }

  void pull();
  const id = setInterval(() => void pull(), 3000);

  return () => {
    cancelled = true;
    clearInterval(id);
  };
}

export function extractMentions(text: string): string[] {
  const matches = text.match(/@([\w.+-]+@[\w.-]+)/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1));
}
