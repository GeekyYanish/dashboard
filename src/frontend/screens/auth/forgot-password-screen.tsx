"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, KeyRound, Mail, ShieldAlert } from "lucide-react";
import { NeoButton, NeoCard, NeoInput, toast } from "@/frontend/components/neo";
import { checkPassword, PASSWORD_STRENGTH_LABELS } from "@/lib/auth/crypto";
import { FEST } from "@/lib/fest.config";
import { cn } from "@/lib/utils";

/**
 * Password recovery for a staff account, by one-time code.
 *
 * A code rather than a reset link because a link is the one thing this system
 * cannot send: the mail transport behind the backend accepts an OTP payload and
 * nothing else, so there is no template to put a URL in.
 *
 * Step two is reachable only by having asked for a code, but the step-one reply
 * is identical whether or not the address exists — so arriving at step two
 * proves nothing about the account, which is the point.
 */
export function ForgotPasswordScreen() {
  const router = useRouter();
  const [step, setStep] = useState<"request" | "reset">("request");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // The backend enforces 30 seconds between codes. Counting it down here means
  // the button explains itself instead of failing.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const check = useMemo(
    () => checkPassword(next, email, { requireSymbol: true }),
    [next, email],
  );
  const mismatch = confirm.length > 0 && next !== confirm;
  const canReset = otp.length >= 4 && check.ok && next === confirm && !busy;

  const request = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as
        | { sent?: boolean; cooldownRemaining?: number; error?: { message?: string } }
        | null;

      if (response.status === 429) {
        setCooldown(data?.cooldownRemaining ?? 30);
        setError(data?.error?.message ?? "Wait a moment before requesting another code.");
        return;
      }
      if (!response.ok || !data?.sent) {
        setError(data?.error?.message ?? "Could not send a reset code. Try again shortly.");
        return;
      }
      setStep("reset");
      setCooldown(30);
    } catch {
      setError("The registration service is unavailable. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const reset = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, newPassword: next }),
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as
        | { reset?: boolean; error?: { message?: string } }
        | null;
      if (!response.ok || !data?.reset) {
        setError(data?.error?.message ?? "Could not reset the password. Request a new code and try again.");
        return;
      }
      toast.success("Password updated", "Sign in with your new password.");
      router.replace("/login");
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
          <span className="neo-raised grid size-12 shrink-0 place-items-center rounded-neo text-signal">
            <KeyRound className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-[1.25rem] font-bold leading-tight tracking-tight text-ink">
              Reset your password
            </h1>
            <p className="engraved mt-1">{FEST.name}{FEST.edition} Registration Console</p>
          </div>
        </div>

        <NeoCard elevated>
          {step === "request" ? (
            <>
              <NeoCard.Header
                title="Step 1 — Get a code"
                subtitle="We'll email a one-time code to your staff address. It is valid for ten minutes."
              />
              <NeoCard.Raw>
                <form onSubmit={request} className="space-y-3">
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

                  {error ? (
                    <div role="alert" className="flex items-start gap-2.5 rounded-neo bg-failed-bg p-3">
                      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-failed" />
                      <p className="text-[0.8rem] leading-snug text-ink-soft">{error}</p>
                    </div>
                  ) : null}

                  <NeoButton
                    type="submit"
                    variant="primary"
                    size="lg"
                    block
                    icon={<Mail />}
                    loading={busy}
                    disabled={!email || busy || cooldown > 0}
                  >
                    {cooldown > 0 ? `Send a code (${cooldown}s)` : "Send the code"}
                  </NeoButton>
                  <NeoButton type="button" variant="ghost" block onClick={() => setStep("reset")}>
                    I already have a code
                  </NeoButton>
                </form>
              </NeoCard.Raw>
            </>
          ) : (
            <>
              <NeoCard.Header
                title="Step 2 — Choose a new password"
                subtitle={`Enter the code sent to ${email || "your email"} and the password you want to use.`}
              />
              <NeoCard.Raw>
                <form onSubmit={reset} className="space-y-3">
                  {email ? null : (
                    <NeoInput
                      label="Email"
                      type="email"
                      autoComplete="username"
                      required
                      icon={<Mail />}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  )}
                  <NeoInput
                    label="One-time code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    autoFocus
                    mono
                    maxLength={8}
                    placeholder="000000"
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                    hint="Six digits, valid for ten minutes"
                  />
                  <NeoInput
                    label="New password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={next}
                    onChange={(event) => setNext(event.target.value)}
                  />

                  {next ? (
                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="engraved">Strength</span>
                        <span
                          className={cn(
                            "text-[0.75rem] font-semibold",
                            check.score >= 3 ? "text-paid" : check.score >= 2 ? "text-pending" : "text-failed",
                          )}
                        >
                          {PASSWORD_STRENGTH_LABELS[check.score]}
                        </span>
                      </div>
                      <div className="neo-inset-sm flex h-1.5 gap-1 overflow-hidden rounded-full p-0">
                        {[0, 1, 2, 3].map((i) => (
                          <span
                            key={i}
                            className={cn(
                              "h-full flex-1 rounded-full transition-colors",
                              i < check.score
                                ? check.score >= 3
                                  ? "bg-paid"
                                  : check.score >= 2
                                    ? "bg-pending"
                                    : "bg-failed"
                                : "bg-transparent",
                            )}
                          />
                        ))}
                      </div>
                      {check.problems.length ? (
                        <ul className="mt-2 space-y-1">
                          {check.problems.map((problem) => (
                            <li key={problem} className="text-[0.75rem] text-ink-muted">
                              · {problem}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 inline-flex items-center gap-1.5 text-[0.75rem] text-paid">
                          <Check className="size-3.5" /> Meets the policy
                        </p>
                      )}
                    </div>
                  ) : null}

                  <NeoInput
                    label="Confirm new password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    error={mismatch ? "Passwords do not match" : undefined}
                  />

                  {error ? (
                    <div role="alert" className="flex items-start gap-2.5 rounded-neo bg-failed-bg p-3">
                      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-failed" />
                      <p className="text-[0.8rem] leading-snug text-ink-soft">{error}</p>
                    </div>
                  ) : null}

                  <NeoButton
                    type="submit"
                    variant="primary"
                    size="lg"
                    block
                    icon={<KeyRound />}
                    loading={busy}
                    disabled={!canReset}
                  >
                    Set password
                  </NeoButton>
                  <NeoButton
                    type="button"
                    variant="ghost"
                    block
                    disabled={busy}
                    onClick={() => {
                      // A fresh code invalidates the one already sent, so this
                      // has to clear what was typed rather than keep it around.
                      setStep("request");
                      setOtp("");
                      setError(null);
                    }}
                  >
                    Start over
                  </NeoButton>
                </form>
              </NeoCard.Raw>
            </>
          )}
        </NeoCard>

        <p className="mt-5 text-center text-[0.72rem] leading-relaxed text-ink-faint">
          <Link href="/login" className="underline underline-offset-2 hover:text-ink-soft">
            Back to sign in
          </Link>
          <br />
          <br />
          Signed up with Google? Your account has no console password — use
          &ldquo;Continue with Google&rdquo; on the sign-in screen.
          <br />
          <br />
          {FEST.fullName}
        </p>
      </div>
    </div>
  );
}
