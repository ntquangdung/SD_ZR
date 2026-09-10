import React, { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { auth, googleProvider, db } from "@/service/firebase";
import { message } from "antd";
import { AuthContext, type AuthUser } from "./authContextValue";

// Assumption: there's a collection named 'allowedAccounts' in Firestore
// each document contains a field `email` with allowed Google email addresses.
// If your collection name/shape differs, update the query below.

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AuthUser>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set a minimum loading duration to prevent flashing and race conditions
    let minLoadingTimer: NodeJS.Timeout;

    const unsub = onAuthStateChanged(auth, async (u: User | null) => {
      if (!u) {
        setUser(null);
        // Only set loading to false after minimum time
        minLoadingTimer = setTimeout(() => setLoading(false), 100);
        return;
      }

      // Check allowed accounts in Firestore (and fetch role if present)
      try {
        const email = u.email;
        if (!email) {
          // no email -> deny
          await signOut(auth);
          setUser(null);
          minLoadingTimer = setTimeout(() => setLoading(false), 100);
          return;
        }

        const q = query(
          collection(db, "allowedAccounts"),
          where("email", "==", email),
        );
        const snap = await getDocs(q);
        if (snap.empty) {
          // not allowed
          await signOut(auth);
          message.error("Tài khoản của bạn chưa được cấp quyền truy cập.");
          setUser(null);
        } else {
          // pick the first matching allowedAccount doc and include role if present
          const d = snap.docs[0];
          const data = d.data() as { role?: number };
          setUser({
            uid: u.uid,
            displayName: u.displayName,
            email: u.email,
            role: typeof data?.role === "number" ? data.role : 0,
            allowedAccountId: d.id,
          });
        }
      } catch (err) {
        console.error("Auth check failed:", err);
        setUser(null);
      } finally {
        minLoadingTimer = setTimeout(() => setLoading(false), 100);
      }
    });

    return () => {
      unsub();
      if (minLoadingTimer) clearTimeout(minLoadingTimer);
    };
  }, []);

  const loginWithGoogle = async () => {
    try {
      setLoading(true);
      const result = await signInWithPopup(auth, googleProvider);
      const u = result.user;

      // check allowed list (same logic as onAuthStateChanged)
      const email = u.email;
      if (!email) {
        await signOut(auth);
        message.error("Không lấy được email từ Google.");
        setLoading(false);
        return;
      }

      const q = query(
        collection(db, "allowedAccounts"),
        where("email", "==", email),
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        await signOut(auth);
        message.error("Tài khoản của bạn chưa được cấp quyền truy cập.");
        setUser(null);
      } else {
        const d = snap.docs[0];
        const data = d.data() as { role?: number };
        setUser({
          uid: u.uid,
          displayName: u.displayName,
          email: u.email,
          role: typeof data?.role === "number" ? data.role : 0,
          allowedAccountId: d.id,
        });
        message.success("Đăng nhập thành công");
      }
    } catch (err) {
      console.error("Login failed:", err);
      message.error("Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
