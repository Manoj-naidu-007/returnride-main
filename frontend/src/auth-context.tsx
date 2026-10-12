import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";

import { api } from "@/src/api";
import { TOKEN_KEY, USER_KEY } from "@/src/constants";
import { storage } from "@/src/utils/storage";

export type Role = "passenger" | "driver" | "admin";
export type User = {
  id: string;
  phone: string;
  name: string;
  role: Role;
  gender?: string | null;
  rating?: number;
  vehicle_model?: string | null;
  vehicle_number?: string | null;
  wallet_balance?: number;
  verified?: boolean;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<User>;
  register: (payload: Record<string, any>) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await storage.secureGet(TOKEN_KEY, "");
      const cached = await storage.getItem<any>(USER_KEY, null);
      if (cached) setUser(cached);
      if (token) {
        try {
          const me = await api.get<User>("/auth/me");
          setUser(me);
          await storage.setItem(USER_KEY, me as any);
        } catch {
          await storage.secureRemove(TOKEN_KEY);
          await storage.removeItem(USER_KEY);
          setUser(null);
        }
      }
      setLoading(false);
    })();
  }, []);

  async function persist(token: string, u: User) {
    await storage.secureSet(TOKEN_KEY, token);
    await storage.setItem(USER_KEY, u as any);
    setUser(u);
  }

  const login = async (phone: string, password: string) => {
    const res = await api.post<{ access_token: string; user: User }>("/auth/login", { phone, password });
    await persist(res.access_token, res.user);
    return res.user;
  };

  const register = async (payload: Record<string, any>) => {
    const res = await api.post<{ access_token: string; user: User }>("/auth/register", payload);
    await persist(res.access_token, res.user);
    return res.user;
  };

  const logout = async () => {
    await storage.secureRemove(TOKEN_KEY);
    await storage.removeItem(USER_KEY);
    setUser(null);
  };

  const refresh = async () => {
    try {
      const me = await api.get<User>("/auth/me");
      setUser(me);
      await storage.setItem(USER_KEY, me as any);
    } catch {
      /* ignore */
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
