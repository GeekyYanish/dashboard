"use client";

import { SubNav } from "@/frontend/components/page";
import { useAsync } from "@/frontend/hooks/use-async";
import { getRepo } from "@/lib/data";
import { hasApiBackend } from "@/lib/data/http/api-client";
import { isDemoOnlyRoute } from "@/frontend/nav";

export function PaymentsNav() {
  const live = hasApiBackend();
  const queue = useAsync(() => getRepo().payments.queue(), []);
  const dues = useAsync(() => getRepo().payments.outstanding(), []);
  const flagged = useAsync(() => getRepo().payments.list({ flaggedOnly: true }), []);
  // Only asked for when the tab is actually shown: in live mode this reads the
  // demo store, and fetching it just to render a count nobody sees is waste.
  const refunds = useAsync(() => (live ? Promise.resolve([]) : getRepo().refunds.list()), [live]);

  /**
   * Reconciliation is gone rather than hidden. It needs a bank-statement
   * import the backend has no endpoint for, and every figure it showed was
   * generated — bank lines, unmatched credits, the lot. A tab inviting staff
   * to chase money that does not exist is worse than no tab.
   */
  const links = [
    { href: "/payments", label: "Ledger" },
    { href: "/payments/queue", label: "Verification", count: queue.data?.length },
    { href: "/payments/dues", label: "Outstanding", count: dues.data?.length },
    { href: "/payments/refunds", label: "Refunds", count: refunds.data?.filter((r) => r.status === "requested").length },
    { href: "/payments/fraud", label: "Flagged", count: flagged.data?.length },
    { href: "/payments/drawer", label: "Cash drawer" },
  ].filter((link) => !(live && isDemoOnlyRoute(link.href)));

  return <SubNav links={links} />;
}
