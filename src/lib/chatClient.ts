import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { firebaseDb } from "@/lib/firebase";

export type ChatMessage = {
  id: string;
  text: string;
  senderEmail: string;
  senderName: string;
  senderPhoto: string | null;
  mentions: string[];
  createdAt: Timestamp | null;
};

const chatCol = () => collection(firebaseDb, "teamChat");

export async function sendChatMessage(msg: {
  text: string;
  senderEmail: string;
  senderName: string;
  senderPhoto: string | null;
  mentions: string[];
}) {
  await addDoc(chatCol(), {
    ...msg,
    createdAt: serverTimestamp(),
  });

  if (msg.mentions.length > 0) {
    await fetch("/api/chat/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: msg.text,
        senderName: msg.senderName,
        mentions: msg.mentions,
      }),
    }).catch(() => {});
  }
}

export function subscribeToChatMessages(
  count: number,
  callback: (messages: ChatMessage[]) => void
) {
  const q = query(chatCol(), orderBy("createdAt", "desc"), limit(count));
  return onSnapshot(q, (snap) => {
    const messages = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as ChatMessage))
      .reverse();
    callback(messages);
  });
}

export function extractMentions(text: string): string[] {
  const matches = text.match(/@([\w.+-]+@[\w.-]+)/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1));
}
