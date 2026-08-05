"use client";

import { SubNav } from "@/frontend/components/page";
import { useAsync } from "@/frontend/hooks/use-async";
import { getRepo } from "@/lib/data";

export function PaymentsNav() {
  const queue = useAsync(() => getRepo().payments.queue(), []);
  const dues = useAsync(() => getRepo().payments.outstanding(), []);
  const refunds = useAsync(() => getRepo().refunds.list(), []);
  const flagged = useAsync(() => getRepo().payments.list({ flaggedOnly: true }), []);
  const unmatched = useAsync(() => getRepo().settlements.unmatched(), []);

  return (
    <SubNav
      links={[
        { href: "/payments", label: "Ledger" },
        { href: "/payments/queue", label: "Verification", count: queue.data?.length },
        { href: "/payments/dues", label: "Outstanding", count: dues.data?.length },
        { href: "/payments/refunds", label: "Refunds", count: refunds.data?.filter((r) => r.status === "requested").length },
        {
          href: "/payments/settlements",
          label: "Reconciliation",
          count: unmatched.data ? unmatched.data.inBank.length + unmatched.data.inApp.length : undefined,
        },
        { href: "/payments/fraud", label: "Flagged", count: flagged.data?.length },
        { href: "/payments/drawer", label: "Cash drawer" },
      ]}
    />
  );
}
