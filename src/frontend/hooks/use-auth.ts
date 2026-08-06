"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRepo } from "@/lib/data";
import { can, rolesFor, type Capability } from "@/lib/auth/permissions";
import type { Session } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/fest.config";

/**
 * The signed-in session, kept in step with other tabs.
 *
 * `status` is a three-state rather than a boolean because "we do not know yet"
 * is a real state: the session lives in localStorage, so the server render
 * cannot see it. Guards must wait for `loading` to clear rather than bouncing
 * a signed-in operator to /login on first paint.
 */
export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    const sync = (s: Session | null) => {
      setSession(s);
      setStatus(s ? "authenticated" : "unauthenticated");
    };
    void getRepo().auth.session().then(sync);
    // Fires on sign-in/out here AND in other tabs, so signing out in one tab
    // does not leave a second tab looking authenticated.
    return getRepo().auth.onAuthStateChange(sync);
  }, []);

  const signOut = useCallback(async () => {
    await getRepo().auth.signOut();
  }, []);

  return { session, status, signOut, role: session?.role ?? null };
}

/**
 * Whether the signed-in role holds a capability.
 *
 * This decides what to DISABLE, not what is allowed — the repository's
 * `assertCan` is the actual gate. Deliberately disable rather than hide: an
 * operator who can see why they cannot do something asks for the right
 * permission; one who sees nothing files a bug report.
 */
export function useCan(cap: Capability) {
  const { role, status } = useAuth();
  const allowed = can(role, cap);
  return {
    allowed,
    /** True while the session is still resolving — keep controls disabled. */
    pending: status === "loading",
    /** "Needs Registration Head or Coordinator" — for the tooltip. */
    reason: allowed
      ? null
      : `Needs ${rolesFor(cap)
          .map((r) => STAFF_ROLES.find((x) => x.id === r)?.label ?? r)
          .join(" or ")}`,
  };
}

/**
 * Client-side route guard.
 *
 * A client guard, not `middleware.ts`, because middleware runs on the server
 * and there is no server session for it to read — see src/lib/auth/session.ts.
 * When the session becomes an httpOnly cookie this whole hook is replaced by
 * middleware and no screen changes.
 */
export function useRequireAuth() {
  const { session, status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
    else if (status === "authenticated" && session?.mustChangePassword)
      router.replace("/login/set-password");
  }, [status, session?.mustChangePassword, router]);

  return { session, status, ready: status === "authenticated" && !session?.mustChangePassword };
}
