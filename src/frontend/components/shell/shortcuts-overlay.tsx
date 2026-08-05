"use client";

import { NeoModal, Kbd, SectionRule } from "@/frontend/components/neo";

const GROUPS: { label: string; keys: [string, string][] }[] = [
  {
    label: "Global",
    keys: [
      ["⌘K / Ctrl K", "Open the command palette"],
      ["/", "Jump to search"],
      ["?", "This cheatsheet"],
      ["Esc", "Close any overlay"],
    ],
  },
  {
    label: "Lists & tables",
    keys: [
      ["J / ↓", "Next row"],
      ["K / ↑", "Previous row"],
      ["Enter", "Open the focused row"],
      ["X", "Toggle selection"],
      ["Shift A", "Select everything on the page"],
    ],
  },
  {
    label: "Verification queue",
    keys: [
      ["A", "Approve and advance"],
      ["R", "Reject with a reason"],
      ["U", "Request re-upload"],
      ["Space", "Zoom the receipt"],
    ],
  },
  {
    label: "Desk",
    keys: [
      ["F2", "New walk-in"],
      ["F3", "Collect payment"],
      ["F4", "Print badge"],
      ["F8", "Issue queue token"],
    ],
  },
];

export function ShortcutsOverlay({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <NeoModal
      open={open}
      onOpenChange={onOpenChange}
      title="Keyboard shortcuts"
      description="The verification queue and the desk are built to be driven without a mouse."
      size="lg"
    >
      <div className="grid gap-6 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <div key={g.label}>
            <SectionRule label={g.label} className="mb-3" />
            <dl className="space-y-2">
              {g.keys.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4">
                  <dt className="text-[0.82rem] text-ink-soft">{v}</dt>
                  <dd>
                    <Kbd>{k}</Kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </NeoModal>
  );
}
