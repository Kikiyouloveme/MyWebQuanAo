import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, TOKEN_KEY, USER_KEY, type User } from "@/lib/api";

interface AuthCtx {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (body: Record<string, unknown>) => Promise<User>;
  logout: () => void;
  /** Nạp lại hồ sơ từ server — dùng sau khi xác minh email, đổi địa chỉ… */
  refresh: () => Promise<User | null>;
  /** Cập nhật user trong bộ nhớ khi API đã trả về bản mới */
  setUser: (u: User) => void;
  setToken: (token: string) => void;
}

const Ctx = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); }
    catch { return null; }
  });
  const [ready, setReady] = useState(false);

  const setUser = useCallback((u: User) => {
    setUserState(u);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  }, []);

  const setToken = useCallback((token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUserState(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY)) return null;
    try {
      const fresh = await api.get<User>("/api/auth/me");
      setUser(fresh);
      return fresh;
    } catch {
      clearSession();
      return null;
    }
  }, [setUser, clearSession]);

  // Xác thực lại token khi mở app — token có thể đã hết hạn hoặc bị thu hồi
  useEffect(() => {
    refresh().finally(() => setReady(true));
  }, [refresh]);

  const store = (token: string, u: User) => {
    setToken(token);
    setUser(u);
  };

  const login = async (email: string, password: string) => {
    const r = await api.post<{ token: string; user: User }>("/api/auth/login", { email, password });
    store(r.token, r.user);
    return r.user;
  };

  const register = async (body: Record<string, unknown>) => {
    const r = await api.post<{ token: string; user: User }>("/api/auth/register", body);
    store(r.token, r.user);
    return r.user;
  };

  return (
    <Ctx.Provider value={{ user, ready, login, register, logout: clearSession, refresh, setUser, setToken }}>
      {children}
    </Ctx.Provider>
  );
}
