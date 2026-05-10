"use client";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { firebaseDb } from "./firebase";
import type { Source, SourceSchedule } from "./sources";

const COLLECTION = "sources";

const DEFAULT_SOURCE = {
  id: "localist-oberlin",
  name: "Localist – Oberlin College Calendar",
  type: "localist" as const,
  baseUrl: "https://calendar.oberlin.edu",
  schedule: "off" as SourceSchedule,
  enabled: true,
  createdAt: Date.now(),
};

export async function ensureDefaultSources(): Promise<void> {
  const ref = doc(firebaseDb, COLLECTION, "localist-oberlin");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, DEFAULT_SOURCE);
  }
}

export async function getSource(id: string): Promise<Source | null> {
  const snap = await getDoc(doc(firebaseDb, COLLECTION, id));
  if (!snap.exists()) return null;
  return snap.data() as Source;
}

export async function updateSource(id: string, updates: Partial<Source>): Promise<void> {
  await updateDoc(doc(firebaseDb, COLLECTION, id), {
    ...updates,
    updatedAt: serverTimestamp(),
  } as Record<string, unknown>);
}
