"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldAlert, Check } from "lucide-react";
import { NeoCard, NeoButton, NeoInput, toast } from "@/frontend/components/neo";
import { getRepo } from "@/lib/data";
import { isDataError } from "@/lib/data/types";
import { checkPassword, PASSWORD_STRENGTH_LABELS } from "@/lib/auth/crypto";
import { FEST, STAFF_ROLES } from "@/lib/fest.config";
import { useAuth } from "@/frontend/hooks/use-auth";
import { cn } from "@/lib/utils";

/**
 * Forced first-login password change.
 *
 * A documented default credential is a way in, not a way to run a fest. This
 * screen is unskippable while `mustChangePassword` is set — the guard in every
 * layout routes back here, so there is no URL that gets around it.
 */
export function SetPasswordScreen() {
  const router = useRouter();
  const { session, status } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  const check = useMemo(() => checkPassword(next, session?.email), [next, session?.email]);
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit = current && check.ok && next === confirm && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await getRepo().auth.changePassword(current, next);
      toast.success("Password updated", "You're all set.");
      router.replace("/");
    } catch (err) {
      setError(isDataError(err) ? err.message : "Could not change the password");
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
              Set your password
            </h1>
            <p className="engraved mt-1">
              {session?.name}
              {session ? ` · ${STAFF_ROLES.find((r) => r.id === session.role)?.label}` : ""}
            </p>
          </div>
        </div>

        <NeoCard elevated>
          <NeoCard.Header
            title="First sign-in"
            subtitle="You signed in with a shared default. Choose your own before continuing — everything you do from here is recorded against your name in the audit log."
          />
          <NeoCard.Raw>
            <form onSubmit={submit} className="space-y-3">
              <NeoInput
                label="Current password"
                type="password"
                autoComplete="current-password"
                required
                autoFocus
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                hint="The one you just used"
              />
              <NeoInput
                label="New password"
                type="password"
                autoComplete="new-password"
                required
                value={next}
                onChange={(e) => setNext(e.target.value)}
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
                      {check.problems.map((p) => (
                        <li key={p} className="text-[0.75rem] text-ink-muted">
                          · {p}
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
                onChange={(e) => setConfirm(e.target.value)}
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
                disabled={!canSubmit}
              >
                Set password & continue
              </NeoButton>
            </form>
          </NeoCard.Raw>
        </NeoCard>

        <p className="mt-5 text-center text-[0.72rem] leading-relaxed text-ink-faint">
          Forgotten which default you used? Sign out and open <span className="font-medium">Demo
          accounts</span> on the login screen — or reset the demo data to restore them.
          <br />
          <br />
          {FEST.fullName}
        </p>
      </div>
    </div>
  );
}
