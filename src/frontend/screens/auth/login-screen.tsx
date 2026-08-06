"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, ShieldAlert, ChevronDown, RotateCcw, Copy, Check } from "lucide-react";
import {
  NeoCard,
  NeoButton,
  NeoInput,
  StatusBadge,
  toast,
} from "@/frontend/components/neo";
import { getRepo } from "@/lib/data";
import { isDataError } from "@/lib/data/types";
import { FEST, STAFF_ROLES } from "@/lib/fest.config";
import { useAuth } from "@/frontend/hooks/use-auth";
import { cn } from "@/lib/utils";

/**
 * The demo accounts.
 *
 * Listed here on purpose: these credentials are already in the README and the
 * seed, and hiding them on the screen they belong to would be security theatre
 * rather than security. Every one forces a password change on first use.
 */
const DEMO_ACCOUNTS = [
  { role: "head", email: "head@gateways26.in", password: "Kestrel$Fest26" },
  { role: "coordinator", email: "coordinator@gateways26.in", password: "Marigold$Fest26" },
  { role: "finance", email: "finance@gateways26.in", password: "Sandalwood$26x" },
  { role: "desk", email: "desk@gateways26.in", password: "Peregrine$26x" },
  { role: "viewer", email: "viewer@gateways26.in", password: "Cardamom$Fest26" },
] as const;

export function LoginScreen() {
  const router = useRouter();
  const { status, session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Already signed in? Do not show a login form — send them where they belong.
  useEffect(() => {
    if (status !== "authenticated") return;
    router.replace(session?.mustChangePassword ? "/login/set-password" : "/");
  }, [status, session?.mustChangePassword, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = await getRepo().auth.signIn(email, password);
      toast.success(`Signed in as ${s.name}`, STAFF_ROLES.find((r) => r.id === s.role)?.label);
      router.replace(s.mustChangePassword ? "/login/set-password" : "/");
    } catch (err) {
      setError(isDataError(err) ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  const fill = (acct: (typeof DEMO_ACCOUNTS)[number]) => {
    setEmail(acct.email);
    setPassword(acct.password);
    setError(null);
    setCopied(acct.role);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[26rem]">
        {/* Brand — the one place besides focus rings that signal orange appears. */}
        <div className="mb-7 flex items-center gap-3">
          <span className="neo-raised grid size-12 shrink-0 place-items-center rounded-neo">
            <span className="block size-4 rounded-[4px] bg-signal" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-[1.4rem] font-bold leading-none tracking-tight text-ink">
              {FEST.name}
              <span className="text-signal">{FEST.edition}</span>
            </h1>
            <p className="engraved mt-1.5">Registration Console</p>
          </div>
        </div>

        <NeoCard elevated>
          <NeoCard.Header
            title="Sign in"
            subtitle="Use the account for your role — what you can do in the console depends on it."
          />
          <NeoCard.Raw>
            <form onSubmit={submit} className="space-y-3">
              <NeoInput
                label="Email"
                type="email"
                autoComplete="username"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@gateways26.in"
              />
              <NeoInput
                label="Password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
              />

              {error ? (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-neo bg-failed-bg p-3"
                >
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-failed" />
                  <p className="text-[0.8rem] leading-snug text-ink-soft">{error}</p>
                </div>
              ) : null}

              <NeoButton
                type="submit"
                variant="primary"
                size="lg"
                block
                icon={<LogIn />}
                loading={busy}
                disabled={!email || !password}
              >
                Sign in
              </NeoButton>
            </form>
          </NeoCard.Raw>
        </NeoCard>

        {/* ---- Demo accounts ------------------------------------------- */}
        <div className="mt-4">
          <button
            onClick={() => setShowAccounts((v) => !v)}
            aria-expanded={showAccounts}
            className="flex w-full items-center gap-2 rounded-neo px-2 py-2 text-[0.82rem] font-medium text-ink-muted transition-colors hover:text-ink"
          >
            <ChevronDown
              className={cn("size-4 transition-transform", showAccounts && "rotate-180")}
            />
            Demo accounts
            <span className="ml-auto text-[0.72rem] text-ink-faint">click to fill</span>
          </button>

          {showAccounts ? (
            <NeoCard className="mt-2">
              <NeoCard.Body flush>
                <ul className="divide-y divide-hairline">
                  {DEMO_ACCOUNTS.map((a) => (
                    <li key={a.role}>
                      <button
                        onClick={() => fill(a)}
                        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-plane-alt"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.82rem] font-medium text-ink">
                            {STAFF_ROLES.find((r) => r.id === a.role)?.label}
                          </span>
                          <span className="block truncate font-mono text-[0.72rem] text-ink-muted">
                            {a.email} · {a.password}
                          </span>
                        </span>
                        {copied === a.role ? (
                          <Check className="size-4 shrink-0 text-paid" />
                        ) : (
                          <Copy className="size-3.5 shrink-0 text-ink-faint" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </NeoCard.Body>
              <NeoCard.Footer>
                <span className="text-[0.75rem] leading-snug">
                  Each account must set its own password on first sign-in.
                </span>
                <NeoButton
                  size="sm"
                  variant="ghost"
                  icon={<RotateCcw />}
                  onClick={async () => {
                    await getRepo().admin.reset();
                    toast.success("Demo data reset", "The default passwords work again.");
                    setEmail("");
                    setPassword("");
                    setTimeout(() => window.location.reload(), 600);
                  }}
                >
                  Reset
                </NeoButton>
              </NeoCard.Footer>
            </NeoCard>
          ) : null}
        </div>

        {/* ---- The honest disclaimer ------------------------------------ */}
        <div className="mt-5 rounded-neo bg-pending-bg p-3.5">
          <div className="mb-1.5 flex items-center gap-2">
            <ShieldAlert className="size-4 shrink-0 text-pending" />
            <StatusBadge tone="pending" size="sm" dot={false}>
              Demo build
            </StatusBadge>
          </div>
          <p className="text-[0.78rem] leading-relaxed text-ink-soft">
            This login is a convincing demonstration, <span className="font-semibold text-ink">not
            a security boundary</span>. Everything runs in your browser, so anyone with devtools can
            edit the stored session. Passwords are properly hashed and every permission is enforced
            in the data layer — but real security needs a server, and there isn&apos;t one yet.
          </p>
        </div>

        <p className="mt-5 text-center text-[0.72rem] text-ink-faint">
          {FEST.fullName} · {FEST.tagline}
          <br />
          {FEST.host}, {FEST.city}
        </p>
      </div>
    </div>
  );
}
