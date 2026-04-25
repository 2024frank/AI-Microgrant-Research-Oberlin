import { db } from "@/lib/firebase";
import { collection, addDoc } from "firebase/firestore";

export async function logActivity(
  user: string,
  action: string,
  label: string,
  details?: string,
) {
  try {
    await addDoc(collection(db, "activity_log"), {
      user,
      action,
      label,
      details: details ?? "",
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Activity logging is best-effort — never block the primary action
  }
}
