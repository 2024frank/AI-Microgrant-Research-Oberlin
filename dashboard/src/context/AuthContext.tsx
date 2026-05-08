"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { getClientAuth, getClientDb } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";

export const ADMIN_EMAIL = "frankkusiap@gmail.com";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, isAdmin: false });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const lastRecordedEmail = useRef<string | null>(null);

  useEffect(() => {
    try {
      const auth = getClientAuth();
      const db = getClientDb();
      const unsubscribe = onAuthStateChanged(auth, async (u) => {
        setUser(u);
        setLoading(false);
        // Record login time once per session (guard against repeated fires)
        if (u?.email && u.email !== lastRecordedEmail.current) {
          lastRecordedEmail.current = u.email;
          try {
            await setDoc(
              doc(db, "user_activity", u.email),
              { email: u.email, lastLogin: new Date().toISOString() },
              { merge: true },
            );
          } catch { /* best-effort */ }
        }
      });
      return unsubscribe;
    } catch (err) {
      console.warn("Auth initialization failed:", err);
      // Fail closed to login route rather than leaving infinite loader.
      setTimeout(() => setLoading(false), 0);
      return () => {};
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin: user?.email === ADMIN_EMAIL }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
