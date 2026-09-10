"use client";

import { DeskScreen } from "@/frontend/screens/desk/desk-screen";
import { WalkInScreen } from "@/frontend/screens/desk/walkin-screen";
import { hasApiBackend } from "@/lib/data/http/api-client";

/**
 * The live desk is the walk-in flow only — find or create the person, enrol
 * them, take the money. The full kiosk keeps queue tokens, kit issue and a
 * cash drawer, none of which have a backend, so it stays on the demo store.
 */
export default function Page() {
  return hasApiBackend() ? <WalkInScreen /> : <DeskScreen />;
}
