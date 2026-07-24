import type { UserRole } from "@/types/database";
import {
  LayoutDashboard,
  TrendingUp,
  ListOrdered,
  Users2,
  UserSquare2,
  Receipt,
  Wallet,
  PiggyBank,
  Percent,
  Landmark,
  Activity,
  PieChart,
  CheckSquare,
  KanbanSquare,
  Trophy,
  GanttChartSquare,
  Settings,
  UserCog,
  Plug,
  Sparkles,
  Headphones,
  Target,
  Megaphone,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles?: UserRole[]; // undefined = all roles
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Owner-level = full finance + company panel. ROP (sales_manager) is trusted
// with sales, marketing, commissions and goals but NOT the company P&L, cash,
// accounts, owner bonuses or the AI brain (which can surface finance).
const OWNER_ROLES: UserRole[] = ["super_admin", "owner"];
const OWNER_ROP: UserRole[] = ["super_admin", "owner", "sales_manager"];
const SALES_VIEW: UserRole[] = ["super_admin", "owner", "sales_manager", "sales"];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Umumiy",
    items: [
      { label: "Boshqaruv paneli", href: "/dashboard", icon: LayoutDashboard, roles: OWNER_ROLES },
      { label: "AI Miya", href: "/brain", icon: Sparkles, roles: OWNER_ROLES },
    ],
  },
  {
    label: "Sotuv",
    items: [
      { label: "Sotuv sharhi", href: "/sales", icon: TrendingUp, roles: SALES_VIEW },
      { label: "Maqsadlar", href: "/sales/goals", icon: Target, roles: SALES_VIEW },
      { label: "Sotuvlar ro'yxati", href: "/sales/list", icon: ListOrdered, roles: SALES_VIEW },
      { label: "Sotuv jamoasi", href: "/sales/team", icon: Users2, roles: SALES_VIEW },
      { label: "Leadlar", href: "/leads", icon: UserSquare2 },
      { label: "Qo'ng'iroq tahlili", href: "/sales/calls", icon: Headphones, roles: SALES_VIEW },
    ],
  },
  {
    label: "Marketing",
    items: [
      { label: "Marketing tahlili", href: "/marketing", icon: Megaphone, roles: OWNER_ROP },
    ],
  },
  {
    label: "Moliya",
    items: [
      { label: "P&L (Foyda)", href: "/finance/pnl", icon: Wallet, roles: OWNER_ROLES },
      { label: "Pul oqimi", href: "/finance/cashflow", icon: Activity, roles: OWNER_ROLES },
      { label: "Taqsimot (Egalar)", href: "/finance/owners", icon: PieChart, roles: OWNER_ROLES },
      { label: "Hisoblar (Kassa)", href: "/finance/accounts", icon: Landmark, roles: OWNER_ROLES },
      { label: "Bonuslar", href: "/finance/bonuses", icon: PiggyBank, roles: OWNER_ROLES },
      { label: "Komissiyalar", href: "/finance/commissions", icon: Percent, roles: OWNER_ROP },
    ],
  },
  {
    label: "Vazifalar",
    items: [
      { label: "Mening vazifalarim", href: "/tasks/my", icon: CheckSquare },
      { label: "Kanban", href: "/tasks/kanban", icon: KanbanSquare },
      { label: "Vaqt jadvali", href: "/tasks/timeline", icon: GanttChartSquare },
      {
        label: "Samaradorlik",
        href: "/tasks/performance",
        icon: Trophy,
        roles: ["super_admin", "owner", "sales_manager"],
      },
    ],
  },
  {
    label: "Sozlamalar",
    items: [
      { label: "Profil", href: "/settings/profile", icon: Settings },
      { label: "Foydalanuvchilar", href: "/settings/users", icon: UserCog, roles: ["super_admin"] },
      { label: "Integratsiyalar", href: "/settings/integrations", icon: Plug, roles: ["super_admin"] },
    ],
  },
];

/** Filter nav groups/items by the current role. */
export function visibleNav(role: UserRole | null): NavGroup[] {
  if (!role) return [];
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.roles || i.roles.includes(role)),
  })).filter((g) => g.items.length > 0);
}

/** Compact bottom-nav for mobile (max 5). */
export const MOBILE_NAV: NavItem[] = [
  { label: "Panel", href: "/dashboard", icon: LayoutDashboard, roles: OWNER_ROLES },
  { label: "Sotuv", href: "/sales", icon: TrendingUp, roles: SALES_VIEW },
  { label: "Leadlar", href: "/leads", icon: UserSquare2 },
  { label: "P&L", href: "/finance/pnl", icon: Wallet, roles: OWNER_ROLES },
  { label: "Vazifa", href: "/tasks/my", icon: CheckSquare },
];

export function visibleMobileNav(role: UserRole | null): NavItem[] {
  if (!role) return [];
  return MOBILE_NAV.filter((i) => !i.roles || i.roles.includes(role));
}
