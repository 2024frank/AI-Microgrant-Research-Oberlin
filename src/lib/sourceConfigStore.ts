import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  addDoc,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { firebaseDb } from "@/lib/firebase";
import type { SourceConfig } from "./sourceConfig";

const configCol = () => collection(firebaseDb, "sourceConfigs");
const chatCol = () => collection(firebaseDb, "sourceBuilderChats");

// Source configs
export async function saveSourceConfig(config: SourceConfig) {
  await setDoc(doc(configCol(), config.id), {
    ...config,
    updatedAt: serverTimestamp(),
  });
}

export async function getSourceConfig(id: string): Promise<SourceConfig | null> {
  const snap = await getDoc(doc(configCol(), id));
  return snap.exists() ? (snap.data() as SourceConfig) : null;
}

export async function listSourceConfigs(): Promise<SourceConfig[]> {
  const snap = await getDocs(configCol());
  return snap.docs.map((d) => d.data() as SourceConfig);
}

export async function deleteSourceConfig(id: string) {
  await deleteDoc(doc(configCol(), id));
}

export async function updateSourceConfig(id: string, updates: Partial<SourceConfig>) {
  await updateDoc(doc(configCol(), id), { ...updates, updatedAt: serverTimestamp() });
}

// Chat sessions
export type ChatSession = {
  id: string;
  title: string;
  createdBy: string;
  createdAt: number;
  messages: ChatMsg[];
};

export type ChatMsg = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  toolResults?: Array<{ tool: string; result: string }>;
};

export async function createChatSession(createdBy: string, title: string): Promise<string> {
  const ref = await addDoc(chatCol(), {
    title,
    createdBy,
    createdAt: Date.now(),
    messages: [],
  });
  return ref.id;
}

export async function getChatSession(id: string): Promise<ChatSession | null> {
  const snap = await getDoc(doc(chatCol(), id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as ChatSession;
}

export async function appendChatMessage(sessionId: string, msg: ChatMsg) {
  const session = await getChatSession(sessionId);
  if (!session) return;
  const messages = [...session.messages, msg];
  await updateDoc(doc(chatCol(), sessionId), { messages });
}

export async function listChatSessions(userEmail: string, count = 20): Promise<ChatSession[]> {
  const q = query(
    chatCol(),
    where("createdBy", "==", userEmail),
    orderBy("createdAt", "desc"),
    limit(count)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatSession));
}

export async function updateChatTitle(sessionId: string, title: string) {
  await updateDoc(doc(chatCol(), sessionId), { title });
}
