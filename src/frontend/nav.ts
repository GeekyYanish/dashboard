import {
  LayoutDashboard,
  ClipboardList,
  Wallet,
  Users,
  Building2,
  UsersRound,
  CalendarDays,
  FileCheck2,
  BedDouble,
  Plane,
  ScanLine,
  MonitorSmartphone,
  Megaphone,
  Award,
  LifeBuoy,
  BarChart3,
  UserCog,
  ScrollText,
  Settings,
  Radio,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Key into OverviewStats for a live badge count. */
  badge?: "verificationQueueDepth" | "docsPending" | "openTickets";
  /** Sub-routes that should still highlight this item. */
  match?: string[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/**
 * Grouped by the registration team's actual working rhythm, not by data model:
 * what you do before the fest, what you do at the desk on the day, and what
 * you run the operation with.
 */
export const NAV: NavSection[] = [
  {
    label: "Overview",
    items: [{ href: "/", label: "Command Center", icon: LayoutDashboard }],
  },
  {
    label: "Intake",
    items: [
      {
        href: "/registrations",
        label: "Registrations",
        icon: ClipboardList,
        match: ["/registrations/import", "/registrations/new", "/registrations/duplicates", "/registrations/clashes", "/registrations/waitlist"],
      },
      { href: "/participants", label: "Participants", icon: Users },
      { href: "/colleges", label: "Colleges", icon: Building2 },
      { href: "/teams", label: "Teams", icon: UsersRound },
      { href: "/events", label: "Events", icon: CalendarDays },
    ],
  },
  {
    label: "Money",
    items: [
      {
        href: "/payments",
        label: "Payments",
        icon: Wallet,
        match: ["/payments/queue", "/payments/dues", "/payments/refunds", "/payments/settlements", "/payments/fraud", "/payments/drawer"],
      },
      { href: "/payments/queue", label: "Verification queue", icon: FileCheck2, badge: "verificationQueueDepth" },
    ],
  },
  {
    label: "Logistics",
    items: [
      { href: "/documents", label: "Documents", icon: FileCheck2, badge: "docsPending" },
      { href: "/accommodation", label: "Accommodation", icon: BedDouble },
      { href: "/travel", label: "Travel & arrivals", icon: Plane },
    ],
  },
  {
    label: "Event day",
    items: [
      { href: "/desk", label: "On-spot desk", icon: MonitorSmartphone },
      { href: "/checkin", label: "Check-in", icon: ScanLine },
      { href: "/live", label: "War room", icon: Radio },
    ],
  },
  {
    label: "Engage",
    items: [
      { href: "/communications", label: "Communications", icon: Megaphone },
      { href: "/certificates", label: "Certificates", icon: Award },
      { href: "/helpdesk", label: "Helpdesk", icon: LifeBuoy, badge: "openTickets" },
    ],
  },
  {
    label: "Operate",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/team", label: "Team & roster", icon: UserCog },
      { href: "/audit", label: "Audit log", icon: ScrollText },
      { href: "/settings", label: "Settings", icon: Settings, match: ["/settings/fees", "/settings/roles", "/settings/privacy", "/settings/form"] },
    ],
  },
];

/** Flat list, for the command palette. */
export const ALL_NAV_ITEMS = NAV.flatMap((s) => s.items.map((i) => ({ ...i, section: s.label })));

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === "/") return pathname === "/";
  if (pathname === item.href) return true;
  if (item.match?.some((m) => pathname === m || pathname.startsWith(m + "/"))) return true;
  // /payments should not light up when /payments/queue has its own entry.
  const hasOwnEntry = ALL_NAV_ITEMS.some((i) => i.href === pathname && i.href !== item.href);
  if (hasOwnEntry) return false;
  return pathname.startsWith(item.href + "/");
}
