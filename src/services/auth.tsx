import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface User {
  id: number;
  username: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  role: string | null;
  projectName: string | null;
  isAdmin: boolean;
  requiresSignupCompletion: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  completeSignup: (
    firstName: string,
    lastName: string,
    newPassword: string
  ) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>(null!);

import { API_BASE_URL as BASE_URL } from "./config";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem("user");
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    // Back-fill fields added over time. Sessions saved before a field
    // existed need sensible defaults so route guards don't misfire.
    return {
      isAdmin: false,
      requiresSignupCompletion: false,
      firstName: null,
      lastName: null,
      ...parsed,
    } as User;
  });
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("token")
  );

  useEffect(() => {
    if (token) localStorage.setItem("token", token);
    else localStorage.removeItem("token");
  }, [token]);

  useEffect(() => {
    if (user) localStorage.setItem("user", JSON.stringify(user));
    else localStorage.removeItem("user");
  }, [user]);

  async function login(username: string, password: string) {
    const res = await fetch(`${BASE_URL}/Auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.message ?? "Login failed");
    }

    const data = await res.json();
    setToken(data.token);
    setUser(data.user);
  }

  function logout() {
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }

  // Admin-invited users sign in with a temp password, then hit this to
  // finish their profile and pick a permanent password. The backend issues
  // a fresh JWT in the response so we don't force a round-trip re-login.
  async function completeSignup(firstName: string, lastName: string, newPassword: string) {
    const res = await fetch(`${BASE_URL}/Auth/complete-signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ firstName, lastName, newPassword }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.message ?? "Failed to complete signup");
    }

    const data = await res.json();
    setToken(data.token);
    setUser(data.user);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        isAuthenticated: !!token,
        completeSignup,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
