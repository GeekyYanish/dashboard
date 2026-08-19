"use client";

import { useMemo, useState } from "react";
import { KeyRound, LogIn, Mail, ShieldAlert, ShieldCheck } from "lucide-react";
import { NeoButton, NeoCard, NeoInput } from "@/frontend/components/neo";
import { FEST } from "@/lib/fest.config";

/**
 * Full top-level navigation, not a fetch: the OAuth state cookie the backend
 * sets on this call must live on the website's origin, because that is where
 * Google's registered redirect_uri points and where the callback lands. See
 * Gateways-website/src/app/console-google/route.ts for the other half.
 */
function consoleGoogleUrl(returnTo: string) {
  const base = (process.env.NEXT_PUBLIC_WEBSITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const url = new URL("/console-google", base);
  url.searchParams.set("returnTo", returnTo);
  return url.toString();
}

function safeReturnTo(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const code = new URLSearchParams(window.location.search).get("error");
    if (code === "handoff_expired") return "That sign-in link expired or was already used. Sign in again.";
    if (code === "backend_unavailable") return "The registration service is unavailable. Try again shortly.";
    if (code === "missing_handoff") return "The secure sign-in code was missing. Sign in again.";
    return null;
  });
  const returnTo = useMemo(() => {
    if (typeof window === "undefined") return "/";
    return safeReturnTo(new URLSearchParams(window.location.search).get("next"));
  }, []);
  const googleUrl = useMemo(() => consoleGoogleUrl(returnTo), [returnTo]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnTo }),
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as
        | { next?: string; error?: { message?: string } }
        | null;
      if (!response.ok || !data?.next) {
        setError(data?.error?.message ?? "Could not sign in. Check your email and password.");
        return;
      }
      window.location.assign(data.next);
    } catch {
      setError("The registration service is unavailable. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[26rem]">
        <div className="mb-7 flex items-center gap-3">
          <span className="neo-raised grid size-12 shrink-0 place-items-center rounded-neo">
            <span className="block size-4 rounded-[4px] bg-signal" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-[1.4rem] font-bold leading-none tracking-tight text-ink">
              {FEST.name}<span className="text-signal">{FEST.edition}</span>
            </h1>
            <p className="engraved mt-1.5">Registration Console</p>
          </div>
        </div>

        <NeoCard elevated>
          <NeoCard.Header
            title="Staff sign in"
            subtitle="Use the email and password assigned to your staff account. Access follows your active role and event assignments."
          />
          <NeoCard.Raw>
            <form onSubmit={submit} className="space-y-3">
              <NeoInput
                label="Email"
                type="email"
                autoComplete="username"
                autoFocus
                required
                icon={<Mail />}
                placeholder="staff@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <NeoInput
                label="Password"
                type="password"
                autoComplete="current-password"
                required
                icon={<KeyRound />}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />

              {error ? (
                <div role="alert" className="flex items-start gap-2.5 rounded-neo bg-failed-bg p-3">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-failed" />
                  <p className="text-[0.8rem] leading-snug text-ink-soft">{error}</p>
                </div>
              ) : null}

              <div className="flex items-start gap-2.5 rounded-neo bg-paid-bg p-3 text-[0.8rem] leading-snug text-ink-soft">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-paid" />
                <span>Staff role, event scope, and revocation are checked against the database on every protected request.</span>
              </div>
              <NeoButton
                type="submit"
                variant="primary"
                size="lg"
                block
                icon={<LogIn />}
                loading={busy}
                disabled={!email || !password}
              >
                Sign in to console
              </NeoButton>
            </form>

            <div className="my-4 flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-hairline" />
              <span className="engraved">or</span>
              <span className="h-px flex-1 bg-hairline" />
            </div>

            <div className="space-y-2">
              <a
                href={googleUrl}
                className="neo-raised-sm flex h-10 items-center justify-center gap-2 rounded-neo text-[0.8rem] font-medium text-ink-soft transition-all hover:-translate-y-px hover:text-ink active:neo-pressed"
              >
                Continue with Google
              </a>
              {/*
                Static hint, not a per-account message: telling a specific
                signin attempt "this account uses Google" would confirm the
                address exists to anyone probing it. This renders identically
                for every visitor and reveals nothing.
              */}
              <p className="text-center text-[0.7rem] leading-relaxed text-ink-faint">
                Signed up with Google? Use the button above — Google accounts have
                no console password.
                <br />
                Participant-only accounts cannot access this console.
              </p>
            </div>
          </NeoCard.Raw>
        </NeoCard>

        <p className="mt-5 text-center text-[0.72rem] text-ink-faint">
          {FEST.fullName} · {FEST.tagline}
          <br />
          {FEST.host}, {FEST.city}
        </p>
      </div>
    </div>
  );
}
