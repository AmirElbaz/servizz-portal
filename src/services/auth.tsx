import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type SignupStatus = "invited" | "email_pending" | "active";

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
  signupStatus: SignupStatus;
  emailVerified: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
  isAuthenticated: boolean;
  // The signup flow consists of three independent backend calls (email,
  // verify-otp, password). We expose them on the context so any page can
  // drive the flow — currently CompleteSignupPage owns the UX.
  submitSignupEmail: (email: string, confirmEmail: string) => Promise<void>;
  resendSignupOtp: () => Promise<void>;
  verifySignupOtp: (code: string) => Promise<void>;
  setSignupPassword: (newPassword: string, confirmPassword: string) => Promise<void>;
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
      signupStatus: "active" as SignupStatus,
      emailVerified: !!parsed.email,
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
    // Return the user so the caller can route based on signupStatus
    // without waiting for the React state update to propagate.
    return data.user as User;
  }

  function logout() {
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }

  // ── Signup-completion flow ──────────────────────────────────────────────
  //
  // Each step is a separate call so the UI can render distinct screens
  // (email → OTP → password). All three require the current JWT — users
  // are authenticated with their temp password before entering the flow.

  async function authJson(url: string, method: string, body: unknown) {
    const res = await fetch(`${BASE_URL}${url}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.message ?? `Request failed: ${res.status}`);
    }
    return data;
  }

  async function submitSignupEmail(email: string, confirmEmail: string) {
    await authJson("/Auth/signup/email", "POST", { email, confirmEmail });
    // We don't trust the backend's signupStatus echo here — we'll re-fetch
    // on the next login. For now, optimistically advance the local copy so
    // the UI moves to the OTP step.
    setUser((prev) =>
      prev ? { ...prev, signupStatus: "email_pending" } : prev
    );
  }

  async function resendSignupOtp() {
    await authJson("/Auth/signup/resend-otp", "POST", {});
  }

  async function verifySignupOtp(code: string) {
    const data = await authJson("/Auth/signup/verify-otp", "POST", { code });
    if (data?.email) {
      setUser((prev) =>
        prev ? { ...prev, email: data.email, emailVerified: true } : prev
      );
    }
  }

  async function setSignupPassword(newPassword: string, confirmPassword: string) {
    await authJson("/Auth/signup/password", "POST", {
      newPassword,
      confirmPassword,
    });
    // The backend deliberately doesn't issue a fresh JWT here — onboarding
    // and "real" session are intentionally split. Clear local state so the
    // app routes back to /login for a clean sign-in.
    logout();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        isAuthenticated: !!token,
        submitSignupEmail,
        resendSignupOtp,
        verifySignupOtp,
        setSignupPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
