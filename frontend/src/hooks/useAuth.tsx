/**
 * hooks/useAuth.tsx
 *
 * Auth context powered by JWT + REST API (replaces Supabase auth).
 * Token is stored in localStorage and attached to every API request
 * via the Axios interceptor in lib/api.ts.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authApi } from "@/lib/api";

export interface AuthUser {
  id: string;
  email: string;
  role: "admin" | "user";
  full_name: string | null;
  phone?: string | null;
  address?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  isAdmin: boolean;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  /** Fetch the current user from the API using the stored token */
  const fetchMe = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) { setLoading(false); return; }
    try {
      const { data } = await authApi.me();
      setUser(data);
    } catch {
      localStorage.removeItem("token");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // On mount, restore session from token in localStorage
  useEffect(() => { fetchMe(); }, [fetchMe]);

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data } = await authApi.register({ email, password, full_name: fullName });
    localStorage.setItem("token", data.token);
    setUser(data.user);
  };

  const signIn = async (email: string, password: string) => {
    const { data } = await authApi.login({ email, password });
    localStorage.setItem("token", data.token);
    setUser(data.user);
  };

  const signOut = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAdmin: user?.role === "admin",
      loading,
      signUp,
      signIn,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
