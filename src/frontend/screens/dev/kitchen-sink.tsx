"use client";

import { useState } from "react";
import { Check, Search, Trash2, Plus, Star, Bell } from "lucide-react";
import { Page, PageHeader } from "@/frontend/components/page";
import {
  NeoCard,
  NeoButton,
  NeoIconButton,
  NeoInput,
  NeoTextarea,
  NeoSelect,
  NeoSearchField,
  NeoToggle,
  NeoCheckbox,
  NeoRadio,
  NeoSegmented,
  NeoSlider,
  NeoTabs,
  NeoStepper,
  NeoProgress,
  NeoRing,
  NeoAvatar,
  NeoSkeleton,
  StatusBadge,
  ToneDot,
  LiveDot,
  NeoStatTile,
  KeyValue,
  SectionRule,
  EmptyState,
  NeoModal,
  NeoDrawer,
  NeoPopover,
  MenuItem,
  NeoTooltip,
  TooltipProvider,
  Kbd,
  DataTable,
  toast,
  type Tone,
} from "@/frontend/components/neo";
import { AreaChart, BarChart, DonutChart, Sparkline, Funnel, HeatmapGrid, StackedBar } from "@/frontend/components/charts";
import { usePrefs } from "@/frontend/prefs";
import { Sparkles } from "lucide-react";

const TONES: Tone[] = ["paid", "pending", "failed", "waitlist", "neutral", "info", "signal"];

/**
 * Every primitive, every state, both families side by side.
 *
 * This is the visual regression surface: after any change to the tokens or the
 * depth utilities in globals.css, this page is what you eyeball — in BOTH
 * themes. The neumorphic set and the plane-level set are shown together
 * deliberately, so the seam between them stays a decision rather than a drift.
 */
export function KitchenSinkScreen() {
  const { theme, setTheme } = usePrefs();
  const [toggle, setToggle] = useState(true);
  const [check, setCheck] = useState(true);
  const [radio, setRadio] = useState("a");
  const [seg, setSeg] = useState("one");
  const [slider, setSlider] = useState(45);
  const [tab, setTab] = useState("first");
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);

  return (
    <TooltipProvider>
      <Page>
        <PageHeader
          title="Kitchen sink"
          description="Every primitive in every state. Check this in both themes after any token change — it is the only visual regression surface this project has."
          actions={
            <NeoSegmented
              value={theme}
              onChange={(v) => setTheme(v as "light" | "dark")}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          }
        />

        {/* ---- The surface ladder ---------------------------------------- */}
        <NeoCard>
          <NeoCard.Header
            eyebrow="Rule 1"
            title="The surface ladder"
            subtitle="L0 canvas · L1 raised/inset · L1c content plane · L2 floating. A raised element may never contain another raised element."
          />
          <NeoCard.Raw>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["neo-raised-sm", "Raised sm"],
                ["neo-raised", "Raised"],
                ["neo-raised-lg", "Raised lg"],
                ["neo-inset-sm", "Inset sm"],
                ["neo-inset", "Inset"],
                ["neo-pressed", "Pressed"],
                ["neo-plane border border-hairline", "Plane (L1c)"],
                ["neo-float border border-hairline", "Float (L2)"],
                ["neo-flat border border-hairline", "Flat"],
              ].map(([cls, label]) => (
                <div key={label} className={`grid h-20 place-items-center rounded-neo ${cls}`}>
                  <span className="engraved">{label}</span>
                </div>
              ))}
            </div>
          </NeoCard.Raw>
        </NeoCard>

        {/* ---- Colour is data --------------------------------------------- */}
        <NeoCard>
          <NeoCard.Header
            eyebrow="Rule 2"
            title="Colour is data"
            subtitle="Chrome is monochrome graphite. Hue is reserved for status, and one signal accent for live/active/focus."
          />
          <NeoCard.Raw className="space-y-4">
            <div>
              <SectionRule label="Status badges" className="mb-2.5" />
              <div className="flex flex-wrap gap-2">
                {TONES.map((t) => (
                  <StatusBadge key={t} tone={t}>
                    {t}
                  </StatusBadge>
                ))}
              </div>
            </div>
            <div>
              <SectionRule label="Small variant + bare dots" className="mb-2.5" />
              <div className="flex flex-wrap items-center gap-3">
                {TONES.map((t) => (
                  <StatusBadge key={t} tone={t} size="sm" dot={false}>
                    {t}
                  </StatusBadge>
                ))}
                <span className="h-4 w-px bg-engrave" />
                {TONES.map((t) => (
                  <ToneDot key={t} tone={t} label={t} />
                ))}
                <span className="h-4 w-px bg-engrave" />
                <LiveDot />
              </div>
            </div>
            <div>
              <SectionRule label="Chart series — validated categorical slots" className="mb-2.5" />
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <span
                    key={n}
                    className="inline-flex items-center gap-1.5 rounded-full bg-plane px-2.5 py-1 text-[0.72rem] text-ink-soft"
                  >
                    <span
                      className="size-2.5 rounded-[3px]"
                      style={{ background: `var(--viz-${n})` }}
                    />
                    viz-{n}
                  </span>
                ))}
              </div>
            </div>
          </NeoCard.Raw>
        </NeoCard>

        {/* ---- Buttons ----------------------------------------------------- */}
        <NeoCard>
          <NeoCard.Header eyebrow="Neumorphic" title="Buttons" subtitle="Hover lifts, active presses, focus rings. Tab through these." />
          <NeoCard.Raw className="space-y-4">
            {(["primary", "secondary", "ghost", "danger"] as const).map((v) => (
              <div key={v} className="flex flex-wrap items-center gap-2">
                <span className="engraved w-20">{v}</span>
                <NeoButton variant={v} size="sm">
                  Small
                </NeoButton>
                <NeoButton variant={v} size="md" icon={<Plus />}>
                  Medium
                </NeoButton>
                <NeoButton variant={v} size="lg" icon={<Star />}>
                  Large
                </NeoButton>
                <NeoButton variant={v} loading>
                  Loading
                </NeoButton>
                <NeoButton variant={v} disabled>
                  Disabled
                </NeoButton>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <span className="engraved w-20">icon</span>
              {(["sm", "md", "lg"] as const).map((s) => (
                <NeoIconButton key={s} label={`Icon ${s}`} size={s}>
                  <Bell />
                </NeoIconButton>
              ))}
              <NeoIconButton label="Active" active>
                <Star />
              </NeoIconButton>
              <NeoIconButton label="Disabled" disabled>
                <Trash2 />
              </NeoIconButton>
              <NeoTooltip content="Tooltips are L2 — a real drop shadow">
                <NeoIconButton label="Hover me">
                  <Sparkles />
                </NeoIconButton>
              </NeoTooltip>
            </div>
          </NeoCard.Raw>
        </NeoCard>

        {/* ---- Controls ---------------------------------------------------- */}
        <div className="grid gap-4 xl:grid-cols-2">
          <NeoCard>
            <NeoCard.Header eyebrow="Neumorphic" title="Inputs" subtitle="Inset wells — the one place the style is unambiguously right." />
            <NeoCard.Raw className="space-y-3">
              <NeoInput label="Text" placeholder="Type something…" />
              <NeoInput label="With icon" icon={<Search />} placeholder="Search…" />
              <NeoInput label="Monospace" mono defaultValue="402812349901" suffix="UTR" />
              <NeoInput label="With hint" hint="Helper text sits below." placeholder="…" />
              <NeoInput label="Error" error="This field is required" placeholder="…" />
              <NeoInput label="Disabled" disabled placeholder="Not editable" />
              <NeoSelect
                label="Select"
                options={[
                  { value: "a", label: "Option A" },
                  { value: "b", label: "Option B" },
                ]}
              />
              <NeoTextarea label="Textarea" placeholder="Multi-line…" />
              <NeoSearchField value={search} onValueChange={setSearch} placeholder="Search field (md)" />
              <NeoSearchField value={search} onValueChange={setSearch} size="lg" placeholder="Search field (lg)" />
            </NeoCard.Raw>
          </NeoCard>

          <NeoCard>
            <NeoCard.Header eyebrow="Neumorphic" title="Selection & range" />
            <NeoCard.Raw className="space-y-4">
              <NeoToggle checked={toggle} onChange={setToggle} label="Toggle" hint="The signature control — a raised pill in an inset track." />
              <NeoToggle checked={false} onChange={() => {}} label="Off state" />
              <NeoToggle checked disabled onChange={() => {}} label="Disabled" />
              <div className="flex flex-wrap gap-4">
                <NeoCheckbox checked={check} onChange={setCheck} label="Checked" />
                <NeoCheckbox checked={false} onChange={() => {}} label="Unchecked" />
                <NeoCheckbox checked={false} indeterminate onChange={() => {}} label="Mixed" />
                <NeoCheckbox checked disabled onChange={() => {}} label="Disabled" />
              </div>
              <div className="space-y-2">
                <NeoRadio checked={radio === "a"} onChange={() => setRadio("a")} label="First option" hint="With a hint line" />
                <NeoRadio checked={radio === "b"} onChange={() => setRadio("b")} label="Second option" />
              </div>
              <NeoSegmented
                value={seg}
                onChange={setSeg}
                options={[
                  { value: "one", label: "One" },
                  { value: "two", label: "Two" },
                  { value: "three", label: "Three" },
                ]}
              />
              <NeoSlider value={slider} onChange={setSlider} label="Slider" format={(v) => `${v}%`} />
            </NeoCard.Raw>
          </NeoCard>
        </div>

        {/* ---- Navigation & progress --------------------------------------- */}
        <div className="grid gap-4 xl:grid-cols-2">
          <NeoCard>
            <NeoCard.Header eyebrow="Neumorphic" title="Navigation" />
            <NeoCard.Raw className="space-y-4">
              <NeoTabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: "first", label: "First", count: 12 },
                  { value: "second", label: "Second", count: 340 },
                  { value: "third", label: "Third" },
                ]}
              />
              <NeoStepper
                current={step}
                onStepClick={setStep}
                steps={[
                  { label: "Upload", hint: "Choose a file" },
                  { label: "Review", hint: "Dry run" },
                  { label: "Commit", hint: "Write" },
                ]}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Kbd>⌘K</Kbd>
                <Kbd>J</Kbd>
                <Kbd>ESC</Kbd>
                <Kbd>F2</Kbd>
              </div>
            </NeoCard.Raw>
          </NeoCard>

          <NeoCard>
            <NeoCard.Header eyebrow="Neumorphic" title="Progress & gauges" />
            <NeoCard.Raw className="space-y-4">
              <NeoProgress value={72} label="Default" showValue />
              <NeoProgress value={38} tone="pending" label="Pending tone" showValue />
              <NeoProgress value={94} tone="failed" size="sm" label="Small, failed tone" showValue />
              <div className="flex flex-wrap items-center gap-5">
                <NeoRing value={68} sublabel="collected" />
                <NeoRing value={42} tone="pending" size={80} sublabel="allotted" />
                <NeoRing value={91} tone="paid" size={64} thickness={7} />
              </div>
            </NeoCard.Raw>
          </NeoCard>
        </div>

        {/* ---- Display ----------------------------------------------------- */}
        <NeoCard>
          <NeoCard.Header eyebrow="Neumorphic" title="Stat tiles" subtitle="The hero surface — exactly what neumorphism flatters." />
          <NeoCard.Raw>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <NeoStatTile label="Plain" value="1,847" />
              <NeoStatTile label="With delta" value="₹4.2L" delta={12.4} deltaLabel="vs last week" />
              <NeoStatTile
                label="Inverted delta"
                value="₹88k"
                delta={-4.2}
                invertDelta
                deltaLabel="lower is better"
              />
              <NeoStatTile
                label="With sparkline"
                value="312"
                icon={<Bell />}
                spark={<Sparkline values={[3, 7, 4, 9, 6, 12, 8, 14, 11, 18]} />}
                onClick={() => toast.info("Tiles can be clickable")}
              />
            </div>
          </NeoCard.Raw>
        </NeoCard>

        <div className="grid gap-4 xl:grid-cols-3">
          <NeoCard>
            <NeoCard.Header eyebrow="Neumorphic" title="Avatars & skeletons" />
            <NeoCard.Raw className="space-y-4">
              <div className="flex items-center gap-2">
                {[24, 30, 38, 48].map((s) => (
                  <NeoAvatar key={s} name="Rhea Kamath" size={s} />
                ))}
              </div>
              <div className="space-y-2">
                <NeoSkeleton className="h-4 w-3/4" />
                <NeoSkeleton className="h-4 w-1/2" />
                <NeoSkeleton className="h-16 w-full" />
              </div>
            </NeoCard.Raw>
          </NeoCard>

          <NeoCard>
            <NeoCard.Header eyebrow="Plane-level" title="Key/value" />
            <NeoCard.Body>
              <dl className="divide-y divide-hairline">
                <KeyValue label="Registration ID" value="R000421" mono />
                <KeyValue label="Participant" value="Aditya Sharma" />
                <KeyValue label="Amount" value="₹450" />
                <KeyValue label="Status" value={<StatusBadge tone="paid" size="sm">Verified</StatusBadge>} />
              </dl>
            </NeoCard.Body>
          </NeoCard>

          <NeoCard>
            <NeoCard.Header eyebrow="Plane-level" title="Empty state" />
            <NeoCard.Body>
              <EmptyState
                icon={<Search />}
                title="Nothing here yet"
                hint="Empty states always name a next action."
                action={<NeoButton variant="primary" icon={<Plus />}>Create one</NeoButton>}
              />
            </NeoCard.Body>
          </NeoCard>
        </div>

        {/* ---- Plane-level table ------------------------------------------- */}
        <NeoCard>
          <NeoCard.Header
            eyebrow="Plane-level (L1c)"
            title="Data table"
            subtitle="Flat, hairline dividers, zero shadows per row. This is why 3,100 rows stay readable AND fast."
          />
          <NeoCard.Body flush>
            <DataTable
              rows={Array.from({ length: 8 }).map((_, i) => ({
                id: String(i),
                code: `R${String(420 + i).padStart(6, "0")}`,
                name: ["Aditya Sharma", "Meera Nair", "Karan Bhat", "Sowmya Hegde"][i % 4],
                amount: [450, 350, 800, 250][i % 4],
                status: (["paid", "pending", "failed", "waitlist"] as Tone[])[i % 4],
              }))}
              columns={[
                {
                  key: "code",
                  header: "Reg ID",
                  width: "110px",
                  sortValue: (r) => r.code,
                  cell: (r) => <span className="font-mono text-[0.76rem] text-ink-muted">{r.code}</span>,
                },
                {
                  key: "name",
                  header: "Participant",
                  sortValue: (r) => r.name,
                  cell: (r) => (
                    <span className="flex items-center gap-2.5">
                      <NeoAvatar name={r.name} size={26} />
                      <span className="font-medium text-ink">{r.name}</span>
                    </span>
                  ),
                },
                {
                  key: "amount",
                  header: "Amount",
                  width: "100px",
                  align: "right",
                  sortValue: (r) => r.amount,
                  cell: (r) => <span className="tnum text-ink-soft">₹{r.amount}</span>,
                },
                {
                  key: "status",
                  header: "Status",
                  width: "120px",
                  cell: (r) => (
                    <StatusBadge tone={r.status} size="sm">
                      {r.status}
                    </StatusBadge>
                  ),
                },
              ]}
              rowKey={(r) => r.id}
              pageSize={5}
            />
          </NeoCard.Body>
        </NeoCard>

        {/* ---- Charts ------------------------------------------------------- */}
        <div className="grid gap-4 xl:grid-cols-2">
          <NeoCard>
            <NeoCard.Header eyebrow="Charts" title="Area — change over time" subtitle="Crosshair and tooltip on hover." />
            <NeoCard.Raw>
              <AreaChart
                labels={Array.from({ length: 14 }).map((_, i) => `${i + 1}`)}
                series={[
                  { key: "a", label: "Registrations", slot: 0, values: [4, 9, 6, 12, 8, 15, 11, 18, 14, 22, 19, 26, 21, 30] },
                  { key: "b", label: "Confirmed", slot: 2, values: [2, 5, 4, 8, 6, 10, 8, 12, 10, 15, 13, 18, 15, 21] },
                ]}
                height={180}
              />
            </NeoCard.Raw>
          </NeoCard>

          <NeoCard>
            <NeoCard.Header eyebrow="Charts" title="Bar — magnitude" />
            <NeoCard.Raw>
              <BarChart
                data={["Tech", "Cultural", "Gaming", "Literary", "Design", "Sports"].map((l, i) => ({
                  label: l,
                  value: [180, 240, 120, 90, 140, 70][i],
                  slot: i,
                }))}
                height={180}
              />
            </NeoCard.Raw>
          </NeoCard>

          <NeoCard>
            <NeoCard.Header eyebrow="Charts" title="Donut — part to whole" subtitle="Legend always carries values." />
            <NeoCard.Raw>
              <DonutChart
                data={[
                  { label: "UPI", value: 62 },
                  { label: "Gateway", value: 16 },
                  { label: "Bank", value: 14 },
                  { label: "Cash", value: 8 },
                ]}
                size={150}
              />
            </NeoCard.Raw>
          </NeoCard>

          <NeoCard>
            <NeoCard.Header eyebrow="Charts" title="Funnel — drop-off" />
            <NeoCard.Raw>
              <Funnel
                stages={[
                  { stage: "Registered", count: 3100 },
                  { stage: "Paid", count: 2400 },
                  { stage: "Verified", count: 2050 },
                  { stage: "Confirmed", count: 1860 },
                  { stage: "Checked in", count: 168 },
                ]}
              />
            </NeoCard.Raw>
          </NeoCard>

          <NeoCard>
            <NeoCard.Header eyebrow="Charts" title="Heatmap — sequential" subtitle="One hue, light to dark. Never a rainbow." />
            <NeoCard.Raw>
              <HeatmapGrid
                cells={Array.from({ length: 12 }).map((_, i) => ({
                  id: String(i),
                  label: `Event ${i + 1}`,
                  value: (i * 8.5) % 100,
                  hint: `${Math.round((i * 8.5) % 100)}% full`,
                }))}
              />
            </NeoCard.Raw>
          </NeoCard>

          <NeoCard>
            <NeoCard.Header eyebrow="Charts" title="Stacked — composition" />
            <NeoCard.Raw>
              <StackedBar
                rows={[
                  { label: "0–7 days", values: { a: 120, b: 40 } },
                  { label: "8–14 days", values: { a: 90, b: 60 } },
                  { label: "15+ days", values: { a: 40, b: 95 } },
                ]}
                keys={[
                  { key: "a", label: "Paid", slot: 2 },
                  { key: "b", label: "Due", slot: 7 },
                ]}
              />
            </NeoCard.Raw>
          </NeoCard>
        </div>

        {/* ---- Overlays ------------------------------------------------------ */}
        <NeoCard>
          <NeoCard.Header eyebrow="L2 — floating" title="Overlays" subtitle="The one level allowed a real drop shadow." />
          <NeoCard.Raw>
            <div className="flex flex-wrap gap-2">
              <NeoButton variant="secondary" onClick={() => setModal(true)}>
                Open modal
              </NeoButton>
              <NeoButton variant="secondary" onClick={() => setDrawer(true)}>
                Open drawer
              </NeoButton>
              <NeoPopover
                trigger={<NeoButton variant="secondary">Open popover</NeoButton>}
                className="w-52"
              >
                <MenuItem icon={<Check />} shortcut="A">
                  Approve
                </MenuItem>
                <MenuItem icon={<Search />}>Find similar</MenuItem>
                <MenuItem icon={<Trash2 />} danger>
                  Delete
                </MenuItem>
                <MenuItem disabled>Disabled item</MenuItem>
              </NeoPopover>
              <NeoButton variant="secondary" onClick={() => toast.success("Saved", "Everything landed.")}>
                Success toast
              </NeoButton>
              <NeoButton variant="secondary" onClick={() => toast.error("Failed", "UTR_ALREADY_USED")}>
                Error toast
              </NeoButton>
              <NeoButton
                variant="secondary"
                onClick={() =>
                  toast.undoable("Registration cancelled", "Waitlister promoted.", () =>
                    toast.info("Undone"),
                  )
                }
              >
                Undoable toast
              </NeoButton>
            </div>
          </NeoCard.Raw>
        </NeoCard>

        <NeoModal
          open={modal}
          onOpenChange={setModal}
          title="Modal title"
          description="Modals trap focus, lock scroll and close on escape — all from Radix, fully reskinned."
          footer={
            <>
              <NeoButton variant="ghost" onClick={() => setModal(false)}>
                Cancel
              </NeoButton>
              <NeoButton variant="primary" onClick={() => setModal(false)}>
                Confirm
              </NeoButton>
            </>
          }
        >
          <div className="space-y-3">
            <NeoInput label="A field inside a modal" placeholder="…" />
            <p className="text-[0.85rem] text-ink-muted">
              Body content scrolls independently of the header and footer.
            </p>
          </div>
        </NeoModal>

        <NeoDrawer
          open={drawer}
          onOpenChange={setDrawer}
          eyebrow="AUR26-01847"
          title="Drawer title"
          footer={
            <NeoButton variant="primary" onClick={() => setDrawer(false)}>
              Done
            </NeoButton>
          }
        >
          <div className="space-y-3">
            <p className="text-[0.85rem] text-ink-muted">
              Detail surfaces are drawers, not pages — the operator never loses their place in a
              filtered list.
            </p>
            <dl className="divide-y divide-hairline">
              <KeyValue label="Field" value="Value" />
              <KeyValue label="Reference" value="402812349901" mono />
            </dl>
          </div>
        </NeoDrawer>
      </Page>
    </TooltipProvider>
  );
}
