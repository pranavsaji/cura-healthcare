import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, type Identity, api } from "../api.js";

/**
 * Session/identity context. On mount it asks the API who we are (`/auth/me`);
 * a `401` means unauthenticated → the router redirects to /login. Tenant/role
 * come entirely from the server session (Phase 05) — the client never trusts
 * local claims.
 */
export interface AuthState {
  identity: Identity | null;
  loading: boolean;
  login: (role?: string) => Promise<void>;
  logout: () => Promise<void>;
  has: (permission: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setIdentity(await api.me());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setIdentity(null);
      else setIdentity(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (role = "clinician") => {
      setLoading(true);
      await api.devLogin(role);
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setIdentity(null);
  }, []);

  const has = useCallback((permission: string) => identity?.permissions.includes(permission) ?? false, [identity]);

  return <AuthContext.Provider value={{ identity, loading, login, logout, has }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
