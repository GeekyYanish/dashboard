"use client";

import { useEffect, useMemo } from "react";
import { ExternalLink, LogIn, ShieldCheck } from "lucide-react";
import { NeoButton, NeoCard } from "@/frontend/components/neo";
import { FEST } from "@/lib/fest.config";

function websiteLoginUrl(returnTo: string) {
  const base = (process.env.NEXT_PUBLIC_WEBSITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const url = new URL("/login", base);
  url.searchParams.set("console", "1");
  url.searchParams.set("next", returnTo);
  return url.toString();
}

function safeReturnTo(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

/**
 * The console intentionally has no credential form. Authentication belongs to
 * the Gateways website; staff accounts are exchanged here only through the
 * short-lived, single-use server handoff created after website login.
 */
export function LoginScreen() {
  const returnTo = useMemo(() => {
    if (typeof window === "undefined") return "/";
    return safeReturnTo(new URLSearchParams(window.location.search).get("next"));
  }, []);
  const target = useMemo(() => websiteLoginUrl(returnTo), [returnTo]);

  useEffect(() => {
    const timer = window.setTimeout(() => window.location.assign(target), 150);
    return () => window.clearTimeout(timer);
  }, [target]);

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
            title="Continue through Gateways"
            subtitle="Staff authenticate on the main website. After login, the server securely hands your active role to this console."
          />
          <NeoCard.Raw>
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 rounded-neo bg-paid-bg p-3 text-[0.8rem] leading-snug text-ink-soft">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-paid" />
                <span>Password, role, event assignment, and revocation are checked by the backend.</span>
              </div>
              <NeoButton
                type="button"
                variant="primary"
                size="lg"
                block
                icon={<LogIn />}
                onClick={() => window.location.assign(target)}
              >
                Continue to website login
              </NeoButton>
              <a
                href={target}
                className="flex items-center justify-center gap-1.5 text-[0.75rem] text-ink-muted underline-offset-2 hover:text-ink hover:underline"
              >
                Open login manually <ExternalLink className="size-3.5" />
              </a>
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
