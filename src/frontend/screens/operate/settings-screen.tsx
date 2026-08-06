"use client";

import { useState } from "react";
import {
  Settings,
  Percent,
  ShieldCheck,
  Lock,
  Palette,
  RotateCcw,
  Check,
  X,
  Ticket,
} from "lucide-react";
import { Page, PageHeader } from "@/frontend/components/page";
import {
  NeoCard,
  NeoButton,
  NeoTabs,
  NeoToggle,
  NeoSegmented,
  StatusBadge,
  KeyValue,
  SectionRule,
  DataTable,
  NeoAvatar,
  NeoModal,
  toast,
  type Column,
} from "@/frontend/components/neo";
import { useAsync } from "@/frontend/hooks/use-async";
import { ALL_CAPABILITIES, CAPABILITY_LABELS, can } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import { getRepo } from "@/lib/data";
import { usePrefs } from "@/frontend/prefs";
import {
  CATEGORIES,
  DOC_TYPES,
  FEES,
  FEST,
  HOSTEL_BLOCKS,
  STAFF_ROLES,
  inr,
  roleById,
} from "@/lib/fest.config";
import type { Coupon } from "@/lib/data/types";
import { titleCase } from "@/frontend/status";

type Tab = "fest" | "fees" | "roles" | "privacy" | "display";

/**
 * Settings.
 *
 * The permission matrix here is real: role changes and refund approvals are
 * enforced in the repository (they throw FORBIDDEN), not merely hidden in the
 * UI. The role picker exists so that can actually be demonstrated.
 */
export function SettingsScreen({ initialTab = "fest" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const { theme, setTheme, density, setDensity, reduceMotion, setReduceMotion } = usePrefs();
  const [resetOpen, setResetOpen] = useState(false);

  const staff = useAsync(() => getRepo().staff.list(), []);
  const actor = useAsync(() => getRepo().admin.actor(), []);
  const coupons = useAsync(() => getRepo().coupons.list(), []);

  const couponCols: Column<Coupon>[] = [
    {
      key: "code",
      header: "Code",
      width: "170px",
      sortValue: (c) => c.code,
      cell: (c) => <span className="font-mono text-[0.8rem] font-semibold text-ink">{c.code}</span>,
    },
    {
      key: "value",
      header: "Discount",
      width: "110px",
      cell: (c) => (
        <span className="tnum text-ink-soft">
          {c.kind === "percent" ? `${c.value}%` : inr(c.value)}
        </span>
      ),
    },
    {
      key: "usage",
      header: "Usage",
      width: "140px",
      sortValue: (c) => c.usedCount / Math.max(1, c.maxUses),
      cell: (c) => (
        <span className="tnum text-[0.78rem] text-ink-muted">
          {c.usedCount} / {c.maxUses}
        </span>
      ),
    },
    {
      key: "applies",
      header: "Applies to",
      width: "130px",
      cell: (c) => (
        <span className="text-[0.78rem] text-ink-soft">
          {c.appliesTo === "all"
            ? "Everyone"
            : (CATEGORIES.find((x) => x.id === c.appliesTo)?.label ?? c.appliesTo)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "104px",
      cell: (c) => (
        <StatusBadge tone={c.isActive ? "paid" : "neutral"} size="sm">
          {c.isActive ? "Active" : "Inactive"}
        </StatusBadge>
      ),
    },
    {
      key: "action",
      header: "",
      width: "90px",
      align: "right",
      cell: (c) => (
        <NeoButton
          size="sm"
          variant="ghost"
          onClick={async () => {
            await getRepo().coupons.update(c.id, { isActive: !c.isActive });
            toast.success(c.isActive ? "Coupon deactivated" : "Coupon activated");
            coupons.reload();
          }}
        >
          {c.isActive ? "Disable" : "Enable"}
        </NeoButton>
      ),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Settings"
        description="Fest identity, fee rules, who can do what, data-privacy obligations and display preferences."
      />

      <NeoTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "fest", label: "Fest", icon: <Settings /> },
          { value: "fees", label: "Fees & coupons", icon: <Percent /> },
          { value: "roles", label: "Roles & access", icon: <Lock /> },
          { value: "privacy", label: "Data privacy", icon: <ShieldCheck /> },
          { value: "display", label: "Display", icon: <Palette /> },
        ]}
      />

      {tab === "fest" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <NeoCard>
            <NeoCard.Header
              eyebrow="Identity"
              title="Fest configuration"
              subtitle="Everything below lives in one file — src/lib/fest.config.ts. Renaming the fest is a single edit."
            />
            <NeoCard.Body>
              <dl className="divide-y divide-hairline">
                <KeyValue label="Name" value={FEST.fullName} />
                <KeyValue label="Tagline" value={FEST.tagline} />
                <KeyValue label="Host" value={FEST.host} />
                <KeyValue label="City" value={FEST.city} />
                <KeyValue label="Days" value={FEST.days.map((d) => d.date).join(" · ")} />
                <KeyValue
                  label="Registration closes"
                  value={new Date(FEST.registrationClosesAt).toLocaleString("en-IN")}
                />
                <KeyValue
                  label="Early bird ends"
                  value={new Date(FEST.earlyBirdEndsAt).toLocaleString("en-IN")}
                />
                <KeyValue label="UPI ID" value={FEST.support.upiId} mono />
                <KeyValue label="Support" value={`${FEST.support.email} · ${FEST.support.phone}`} />
              </dl>
            </NeoCard.Body>
          </NeoCard>

          <div className="space-y-4">
            <NeoCard>
              <NeoCard.Header eyebrow="Form" title="Registrant categories" />
              <NeoCard.Body flush>
                <ul className="divide-y divide-hairline">
                  {CATEGORIES.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span
                        className="size-3 shrink-0 rounded-[4px]"
                        style={{ background: c.badge }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.83rem] font-medium text-ink">{c.label}</span>
                        <span className="block truncate text-[0.72rem] text-ink-muted">
                          {c.blurb}
                        </span>
                      </span>
                      <span className="tnum shrink-0 text-[0.8rem] font-semibold text-ink">
                        {inr(c.baseFee)}
                      </span>
                    </li>
                  ))}
                </ul>
              </NeoCard.Body>
            </NeoCard>

            <NeoCard>
              <NeoCard.Header
                eyebrow="Gates"
                title="Required documents"
                subtitle="A document that gates 'badge' blocks printing; one that gates 'accommodation' blocks a bed."
              />
              <NeoCard.Body flush>
                <ul className="divide-y divide-hairline">
                  {DOC_TYPES.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.83rem] font-medium text-ink">{d.label}</span>
                        <span className="block truncate text-[0.72rem] text-ink-muted">
                          {d.blurb}
                        </span>
                      </span>
                      <span className="flex shrink-0 gap-1">
                        {(d.gates as readonly string[]).map((g) => (
                          <StatusBadge key={g} tone="neutral" size="sm" dot={false}>
                            {g}
                          </StatusBadge>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </NeoCard.Body>
            </NeoCard>
          </div>
        </div>
      ) : null}

      {tab === "fees" ? (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <NeoCard>
              <NeoCard.Header eyebrow="Rules" title="Fee structure" />
              <NeoCard.Body>
                <dl className="divide-y divide-hairline">
                  <KeyValue label="Early-bird discount" value={`${FEES.earlyBirdDiscountPct}%`} />
                  <KeyValue
                    label="Contingent discount"
                    value={`${FEES.groupDiscountPct}% for ${FEES.groupDiscountMinSize}+ from one college`}
                  />
                  <KeyValue label="On-spot surcharge" value={inr(FEES.onSpotSurcharge)} />
                  <KeyValue label="Accommodation" value={`${inr(FEES.accommodationPerNight)} / night`} />
                </dl>
                <SectionRule label="Refund policy" className="mb-2 mt-4" />
                <dl className="divide-y divide-hairline">
                  {FEES.refundTiers.map((t) => (
                    <KeyValue
                      key={t.beforeDays}
                      label={
                        t.beforeDays > 0
                          ? `Cancelled ${t.beforeDays}+ days before`
                          : "Cancelled inside 10 days"
                      }
                      value={`${t.refundPct}% refunded`}
                    />
                  ))}
                </dl>
              </NeoCard.Body>
            </NeoCard>

            <NeoCard>
              <NeoCard.Header eyebrow="Hostel" title="Blocks" />
              <NeoCard.Body flush>
                <ul className="divide-y divide-hairline">
                  {HOSTEL_BLOCKS.map((b) => (
                    <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="min-w-0 flex-1 text-[0.83rem] font-medium text-ink">
                        {b.name}
                      </span>
                      <StatusBadge tone="info" size="sm" dot={false}>
                        {titleCase(b.gender)}
                      </StatusBadge>
                      <span className="tnum shrink-0 text-[0.78rem] text-ink-muted">
                        {b.floors * b.roomsPerFloor * b.bedsPerRoom} beds
                      </span>
                    </li>
                  ))}
                </ul>
              </NeoCard.Body>
            </NeoCard>
          </div>

          <NeoCard>
            <NeoCard.Header eyebrow="Discounts" title="Coupon codes" icon={<Ticket />} />
            <NeoCard.Body flush>
              <DataTable
                rows={coupons.data ?? []}
                columns={couponCols}
                rowKey={(c) => c.id}
                loading={coupons.loading}
                pageSize={10}
              />
            </NeoCard.Body>
          </NeoCard>
        </div>
      ) : null}

      {tab === "roles" ? (
        <div className="space-y-4">
          <NeoCard>
            <NeoCard.Header
              eyebrow="Signed in as"
              title={actor.data?.name ?? "Not signed in"}
              subtitle={
                actor.data
                  ? roleById(actor.data.role)?.blurb
                  : "Sign in to see what your role can do."
              }
              icon={<Lock />}
              actions={
                actor.data ? (
                  <StatusBadge tone="signal" size="sm">
                    {roleById(actor.data.role)?.label}
                  </StatusBadge>
                ) : null
              }
            />
            <NeoCard.Body>
              <p className="text-[0.83rem] leading-relaxed text-ink-soft">
                Roles are changed by the Registration Head from{" "}
                <span className="font-medium text-ink">Team &amp; roster</span>, and take effect on
                the member&apos;s next action. There is deliberately no &ldquo;act as someone
                else&rdquo; switch here — it existed before login, and with real accounts it would
                be a one-click privilege escalation.
              </p>
            </NeoCard.Body>
          </NeoCard>

          <NeoCard>
            <NeoCard.Header
              eyebrow="Matrix"
              title="What each role can do"
              subtitle="Rendered from the same capability map the data layer enforces — this table cannot drift out of step with what actually happens."
            />
            <NeoCard.Body flush>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-plane">
                    <tr className="border-b border-hairline">
                      <th className="engraved px-4 py-2.5 text-left">Capability</th>
                      {STAFF_ROLES.map((r) => (
                        <th
                          key={r.id}
                          className={cn(
                            "engraved px-3 py-2.5 text-center",
                            actor.data?.role === r.id && "!text-signal",
                          )}
                        >
                          {r.label.split(" ")[0]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-hairline">
                      <td className="px-4 py-2.5 text-[0.82rem] text-ink-soft">
                        View everything
                      </td>
                      {STAFF_ROLES.map((r) => (
                        <td
                          key={r.id}
                          className={cn(
                            "px-3 py-2.5 text-center",
                            actor.data?.role === r.id && "bg-signal-soft/40",
                          )}
                        >
                          <Check className="mx-auto size-4 text-paid" />
                        </td>
                      ))}
                    </tr>
                    {ALL_CAPABILITIES.map((capability) => (
                      <tr key={capability} className="border-b border-hairline">
                        <td className="px-4 py-2.5 text-[0.82rem] text-ink-soft">
                          {CAPABILITY_LABELS[capability]}
                          <span className="ml-2 font-mono text-[0.68rem] text-ink-faint">
                            {capability}
                          </span>
                        </td>
                        {STAFF_ROLES.map((r) => (
                          <td
                            key={r.id}
                            className={cn(
                              "px-3 py-2.5 text-center",
                              actor.data?.role === r.id && "bg-signal-soft/40",
                            )}
                          >
                            {can(r.id, capability) ? (
                              <Check className="mx-auto size-4 text-paid" />
                            ) : (
                              <X className="mx-auto size-4 text-ink-faint opacity-40" />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </NeoCard.Body>
            <NeoCard.Footer>
              <span className="text-[0.75rem] leading-snug">
                Every row is asserted in both directions by the test suite — an allowed role
                succeeds, a denied role throws FORBIDDEN.
              </span>
            </NeoCard.Footer>
          </NeoCard>
        </div>
      ) : null}

      {tab === "privacy" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <NeoCard>
            <NeoCard.Header
              eyebrow="Obligations"
              title="Data privacy"
              subtitle="A fest holds phone numbers, dates of birth, guardian details and ID scans for thousands of minors and adults. That carries duties."
              icon={<ShieldCheck />}
            />
            <NeoCard.Body>
              <ul className="space-y-3 text-[0.83rem] leading-relaxed text-ink-soft">
                <li>
                  <span className="font-semibold text-ink">Export.</span> Any participant can be
                  handed everything held about them as JSON — from their profile drawer.
                </li>
                <li>
                  <span className="font-semibold text-ink">Erasure.</span> Name, email, phone and
                  emergency contact are anonymised. Financial records are retained but
                  de-identified: an erasure request cannot delete an audited money trail.
                </li>
                <li>
                  <span className="font-semibold text-ink">Minors.</span> Anyone under 18 on the
                  fest start date requires guardian consent before a badge or a bed.
                </li>
                <li>
                  <span className="font-semibold text-ink">Audit.</span> Every mutation is recorded
                  with actor, timestamp and before/after state.
                </li>
              </ul>
            </NeoCard.Body>
          </NeoCard>

          <NeoCard>
            <NeoCard.Header
              eyebrow="Danger zone"
              title="Reset demo data"
              subtitle="Wipes every local change and regenerates the seeded dataset deterministically."
            />
            <NeoCard.Body>
              <p className="mb-4 text-[0.83rem] leading-relaxed text-ink-muted">
                This console stores mutations in the browser only. Resetting returns the whole
                dataset to its seeded state — same 2,414 participants, same figures, every time.
              </p>
              <NeoButton variant="danger" icon={<RotateCcw />} onClick={() => setResetOpen(true)}>
                Reset all data
              </NeoButton>
            </NeoCard.Body>
          </NeoCard>
        </div>
      ) : null}

      {tab === "display" ? (
        <NeoCard>
          <NeoCard.Header
            eyebrow="Preferences"
            title="Display"
            subtitle="Stored per browser. The theme is applied before first paint, so there is no flash on reload."
          />
          <NeoCard.Body className="space-y-5">
            <div>
              <div className="engraved mb-2">Theme</div>
              <NeoSegmented
                value={theme}
                onChange={(v) => setTheme(v as "light" | "dark")}
                options={[
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
              />
            </div>

            <div>
              <div className="engraved mb-2">Row density</div>
              <NeoSegmented
                value={density}
                onChange={(v) => setDensity(v as "compact" | "default" | "roomy")}
                options={[
                  { value: "compact", label: "Compact" },
                  { value: "default", label: "Default" },
                  { value: "roomy", label: "Roomy" },
                ]}
              />
              <p className="mt-2 text-[0.78rem] text-ink-muted">
                Compact fits roughly a third more rows on screen — worth it once a list runs past a
                thousand.
              </p>
            </div>

            <div className="border-t border-engrave pt-4">
              <NeoToggle
                checked={reduceMotion}
                onChange={setReduceMotion}
                label="Reduce motion"
                hint="Also honoured automatically from your OS setting."
              />
            </div>
          </NeoCard.Body>
        </NeoCard>
      ) : null}

      <NeoModal
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset all data?"
        description="Every local change — verifications, allotments, walk-ins — is discarded and the seeded dataset is regenerated."
        footer={
          <>
            <NeoButton variant="ghost" onClick={() => setResetOpen(false)}>
              Cancel
            </NeoButton>
            <NeoButton
              variant="danger"
              icon={<RotateCcw />}
              onClick={async () => {
                await getRepo().admin.reset();
                toast.success("Data reset", "Reloading…");
                setTimeout(() => window.location.reload(), 700);
              }}
            >
              Reset everything
            </NeoButton>
          </>
        }
      >
        <p className="text-[0.85rem] leading-relaxed text-ink-soft">
          This cannot be undone. The regenerated data is identical every time — same seed, same
          2,414 participants, same figures.
        </p>
      </NeoModal>
    </Page>
  );
}
