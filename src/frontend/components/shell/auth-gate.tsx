"use client";

import type { ReactNode } from "react";
import { useRequireAuth } from "@/frontend/hooks/use-auth";
import { NeoSkeleton } from "@/frontend/components/neo";

/**
 * Route guard.
 *
 * This is a CLIENT guard, not `middleware.ts`, and that is forced rather than
 * chosen: middleware runs on the server, and the session lives in localStorage
 * where the server cannot see it. See src/lib/auth/session.ts.
 *
 * When the session becomes an httpOnly cookie, this component is deleted and
 * replaced by a `middleware.ts` matcher. No screen below it changes.
 *
 * It renders a skeleton rather than null while the session resolves, because
 * the alternative is a flash of empty layout on every navigation.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, ready } = useRequireAuth();

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas p-6">
        <div className="w-full max-w-md space-y-3" aria-busy="true">
          <NeoSkeleton className="h-12 w-48 rounded-neo" />
          <NeoSkeleton className="h-32 rounded-neo-lg" />
          <span className="sr-only">
            {status === "loading" ? "Checking your session" : "Redirecting to sign in"}
          </span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
