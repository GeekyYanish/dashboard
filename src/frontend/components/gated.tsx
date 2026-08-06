"use client";

import { NeoButton, NeoTooltip, type NeoButtonProps } from "@/frontend/components/neo";
import { useCan } from "@/frontend/hooks/use-auth";
import type { Capability } from "@/lib/auth/permissions";

/**
 * A button that respects the signed-in role.
 *
 * It DISABLES rather than hides, and says why. That is a deliberate choice: an
 * operator who can see "Needs Registration Head" asks for the right permission,
 * whereas one who sees nothing reports the console as broken. Hiding also makes
 * the UI shift between roles, so nobody can be walked through a screen over the
 * phone.
 *
 * This is a courtesy, not the gate. The repository's `assertCan` is what
 * actually stops the write — if this component vanished entirely, permissions
 * would still hold.
 */
export function GatedButton({
  capability,
  children,
  ...props
}: NeoButtonProps & { capability: Capability }) {
  const { allowed, pending, reason } = useCan(capability);

  const button = (
    <NeoButton {...props} disabled={props.disabled || !allowed || pending}>
      {children}
    </NeoButton>
  );

  // No tooltip when it is allowed — a tooltip on every enabled control is noise.
  if (allowed || pending) return button;

  return (
    <NeoTooltip content={reason ?? "Not permitted for your role"}>
      {/* Wrapper: a disabled button fires no pointer events, so the tooltip
          would never trigger without something above it to catch them. */}
      <span className="inline-flex">{button}</span>
    </NeoTooltip>
  );
}
