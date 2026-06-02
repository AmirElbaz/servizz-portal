import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type SignupStatus =
  | "invited"          // admin-invited, not yet started
  | "email_pending"    // admin-invite flow: email submitted, OTP pending
  | "requested"        // user-requested access: PIN issued, registration not done
  | "pending_approval" // registration done, awaiting admin approval
  | "active";

// Access tier, low → high. Mirrors the backend AccessRole enum + [MinRole]
// filter. This is COSMETIC gating only — the server re-checks every action.
export type AccessRole = "client" | "centrecom_user" | "admin" | "super_admin";

const ROLE_ORDER: Record<string, number> = {
  client: 1,
  centrecom_user: 2,
  admin: 3,
  super_admin: 4,
};

// True when `role` is at least `min`. Unknown / null / legacy ("user") roles
// sort below everything → treated as client (the safe floor).
export function roleAtLeast(role: string | null | undefined, min: AccessRole): boolean {
  return (ROLE_ORDER[(role ?? "").toLowerCase()] ?? 0) >= ROLE_ORDER[min];
}

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
  // Inactivity soft-lock: the session token is kept (still valid) but the UI
  // is locked. The user re-enters with their 4-digit PIN (pinLogin) WITHOUT
  // retyping their password — but only while the token is unexpired. `lock`
  // is called by the inactivity timer; once the token's ~8h hard cap passes,
  // pinLogin 401s and a full login is forced.
  locked: boolean;
  lock: () => void;
  pinLogin: (pin: string) => Promise<User>;
  // Admin-invite completion. The current flow is a SINGLE call: optional
  // email + new password (+ confirm) in one step (completeSignup). The older
  // OTP trio (submitSignupEmail / resendSignupOtp / verifySignupOtp +
  // setSignupPassword) is kept available but unused by the current UI so the
  // verified-email flow can be re-enabled without rebuilding it.
  completeSignup: (email: string | null, newPassword: string, confirmPassword: string) => Promise<void>;
  submitSignupEmail: (email: string, confirmEmail: string) => Promise<void>;
  resendSignupOtp: () => Promise<void>;
  verifySignupOtp: (code: string) => Promise<void>;
  setSignupPassword: (newPassword: string, confirmPassword: string) => Promise<void>;
  // User-initiated request-access flow (public request + post-PIN-login finish).
  requestAccess: (email: string) => Promise<string>;
  completeRegistration: (
    firstName: string, lastName: string, newPassword: string, confirmPassword: string, pin: string,
  ) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>(null!);

import { API_BASE_URL as BASE_URL } from "./config";

// Idle time before the session soft-locks (token kept; PIN unlock offered).
const INACTIVITY_MS = 15 * 60 * 1000;

// True while the JWT's `exp` is in the future. Used to gate PIN quick-unlock —
// once the token has expired there's nothing valid to ride, so a full login is
// required. Malformed/absent tokens are treated as invalid.
function isTokenValid(t: string | null): boolean {
  if (!t) return false;
  try {
    const payload = JSON.parse(atob(t.split(".")[1]));
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

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
  // Soft-locked by inactivity. Only meaningful while a still-valid token is
  // held (PIN unlock needs it); a stale "locked" flag with an expired token is
  // ignored here and cleared by the mount effect below.
  const [locked, setLocked] = useState<boolean>(
    () => localStorage.getItem("locked") === "1" && isTokenValid(localStorage.getItem("token")),
  );

  useEffect(() => {
    if (token) localStorage.setItem("token", token);
    else localStorage.removeItem("token");
  }, [token]);

  // On load, drop an expired token outright — no valid session to lock or PIN
  // back into. Runs once.
  useEffect(() => {
    if (token && !isTokenValid(token)) logout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // Fresh full login clears any stale inactivity lock.
    setLocked(false);
    localStorage.removeItem("locked");
    // Return the user so the caller can route based on signupStatus
    // without waiting for the React state update to propagate.
    return data.user as User;
  }

  function logout() {
    setToken(null);
    setUser(null);
    setLocked(false);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("locked");
  }

  // Soft-lock on inactivity: keep the token (so PIN unlock works) but flag the
  // UI as locked. No-op into a full logout if the token has already expired.
  function lock() {
    if (!isTokenValid(localStorage.getItem("token"))) {
      logout();
      return;
    }
    setLocked(true);
    localStorage.setItem("locked", "1");
  }

  // Re-enter a locked (but still-valid) session with the 4-digit PIN. The
  // backend endpoint is [Authorize], so an expired token → 401 → we force a
  // full login. On success the SAME token keeps being used (no extension).
  async function pinLogin(pin: string): Promise<User> {
    const t = localStorage.getItem("token");
    const res = await fetch(`${BASE_URL}/Auth/pin-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      body: JSON.stringify({ pin }),
    });
    if (res.status === 401) {
      logout();
      throw new Error("Your session has expired — please sign in with your password.");
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message ?? "Invalid PIN.");
    setUser(data.user);
    setLocked(false);
    localStorage.removeItem("locked");
    return data.user as User;
  }

  // Arm the inactivity timer for an active, unlocked session. Any user
  // interaction resets it; INACTIVITY_MS of silence → lock().
  useEffect(() => {
    if (!token || locked || user?.signupStatus !== "active") return;
    let timer: number;
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => lock(), INACTIVITY_MS);
    };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, locked, user?.signupStatus]);

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

  // Single-step admin-invite completion: optional email + new password. On
  // 204 the backend flips the user to 'active' and issues no fresh JWT, so we
  // clear local state and let the app route back to /login for a clean sign-in.
  async function completeSignup(
    email: string | null,
    newPassword: string,
    confirmPassword: string,
  ) {
    await authJson("/Auth/signup/complete", "POST", {
      email: email?.trim() ?? "",
      newPassword,
      confirmPassword,
    });
    logout();
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

  // Public: anyone can request access with their email. Backend emails a
  // 16-char PIN; the user then logs in with email + PIN (normal /login).
  async function requestAccess(email: string) {
    const res = await fetch(`${BASE_URL}/Auth/request-access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message ?? "Could not submit your request.");
    return (data?.message as string) ?? "If your email is eligible, a registration PIN has been sent.";
  }

  // After PIN login (status 'requested'): set name + real password. Moves the
  // user to 'pending_approval'; we clear the session so they sign in fresh.
  async function completeRegistration(
    firstName: string, lastName: string, newPassword: string, confirmPassword: string, pin: string,
  ) {
    await authJson("/Auth/complete-registration", "POST", {
      firstName, lastName, newPassword, confirmPassword, pin,
    });
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
        locked,
        lock,
        pinLogin,
        completeSignup,
        submitSignupEmail,
        resendSignupOtp,
        verifySignupOtp,
        setSignupPassword,
        requestAccess,
        completeRegistration,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
