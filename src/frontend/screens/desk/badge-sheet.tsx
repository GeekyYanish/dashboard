"use client";

import { useEffect } from "react";
import { Printer, X } from "lucide-react";
import { NeoButton } from "@/frontend/components/neo";
import { CATEGORIES, FEST } from "@/lib/fest.config";
import type { Participant } from "@/lib/data/types";

/**
 * Badge / ID card, print-optimised.
 *
 * The neumorphic layer is flattened away by the print rules in globals.css —
 * soft shadows cost ink and mean nothing on card stock. What matters on paper
 * is a big name, a scannable code, and a category colour a marshal can read
 * across a corridor.
 */

/** Deterministic QR-ish matrix. A real build swaps in a QR encoder. */
function CodeMatrix({ value, size = 92 }: { value: string; size?: number }) {
  const N = 21;
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const bit = (i: number) => {
    let x = (h ^ (i * 2654435761)) >>> 0;
    x ^= x >>> 13;
    x = Math.imul(x, 1274126177) >>> 0;
    return ((x >>> 7) & 1) === 1;
  };
  const cell = size / N;
  const finder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);

  const rects: React.ReactElement[] = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const inFinder = finder(r, c);
      let on: boolean;
      if (inFinder) {
        const rr = r < 7 ? r : r - (N - 7);
        const cc = c < 7 ? c : c - (N - 7);
        on = rr === 0 || rr === 6 || cc === 0 || cc === 6 || (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4);
      } else {
        on = bit(r * N + c);
      }
      if (on)
        rects.push(
          <rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill="#000" />,
        );
    }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`QR code for ${value}`}>
      <rect width={size} height={size} fill="#fff" />
      {rects}
    </svg>
  );
}

export function BadgeSheet({
  participant,
  college,
  onClose,
}: {
  participant: Participant | null;
  college?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (participant) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [participant, onClose]);

  if (!participant) return null;
  const cat = CATEGORIES.find((c) => c.id === participant.category);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto p-6 print:static print:p-0"
      style={{ background: "var(--neo-scrim)" }}
    >
      <div className="mb-4 flex gap-2 print:hidden" data-print-hide>
        <NeoButton variant="secondary" icon={<X />} onClick={onClose}>
          Close
        </NeoButton>
        <NeoButton variant="primary" icon={<Printer />} onClick={() => window.print()}>
          Print badge
        </NeoButton>
      </div>

      {/* 54 × 86mm — standard lanyard card, portrait. */}
      <div
        className="neo-float rounded-neo-lg bg-plane p-0 print:rounded-none print:shadow-none"
        style={{ width: "54mm" }}
      >
        <div className="flex h-full flex-col" style={{ minHeight: "86mm" }}>
          <div
            className="flex items-center justify-between px-3 py-2 text-white"
            style={{ background: cat?.badge ?? "#20211d" }}
          >
            <span className="font-display text-[0.8rem] font-bold leading-none">
              {FEST.name}
              {FEST.edition}
            </span>
            <span className="text-[0.6rem] font-bold tracking-[0.14em]">{cat?.short}</span>
          </div>

          <div className="flex flex-1 flex-col items-center px-3 py-3 text-center">
            <CodeMatrix value={participant.code} size={92} />

            <p className="mt-2 font-mono text-[0.62rem] tracking-tight text-ink-muted">
              {participant.code}
            </p>

            <p className="mt-2 font-display text-[0.95rem] leading-tight font-bold text-ink">
              {participant.fullName}
            </p>
            <p className="mt-0.5 text-[0.62rem] leading-snug text-ink-muted">
              {college ?? ""}
              <br />
              {participant.department}
            </p>

            <div className="mt-auto w-full border-t border-hairline pt-1.5">
              <p className="text-[0.55rem] leading-tight text-ink-faint">
                Emergency: {participant.emergencyPhone || "—"} · Desk: {FEST.support.phone}
              </p>
              <p className="text-[0.55rem] leading-tight text-ink-faint">
                {participant.tshirtSize} · {participant.dietaryPref.replace("_", "-")}
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-[0.75rem] text-ink-muted print:hidden" data-print-hide>
        54 × 86 mm lanyard card. The shadow layer is stripped in print — see the
        <code className="mx-1">@media print</code> block in globals.css.
      </p>
    </div>
  );
}
