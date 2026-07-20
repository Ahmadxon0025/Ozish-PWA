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

const FINANCE_ROLES: UserRole[] = ["super_admin", "owner", "sales_manager"];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Umumiy",
    items: [
      { label: "Boshqaruv paneli", href: "/dashboard", icon: LayoutDashboard },
      { label: "AI Miya", href: "/brain", icon: Sparkles, roles: FINANCE_ROLES },
    ],
  },
  {
    label: "Sotuv",
    items: [
      { label: "Sotuv sharhi", href: "/sales", icon: TrendingUp },
      { label: "Maqsadlar", href: "/sales/goals", icon: Target, roles: FINANCE_ROLES },
      { label: "Marketing tahlili", href: "/sales/marketing", icon: Megaphone, roles: FINANCE_ROLES },
      { label: "Sotuvlar ro'yxati", href: "/sales/list", icon: ListOrdered },
      { label: "Sotuv jamoasi", href: "/sales/team", icon: Users2 },
      { label: "Leadlar", href: "/leads", icon: UserSquare2 },
      { label: "Qo'ng'iroq tahlili", href: "/sales/calls", icon: Headphones },
    ],
  },
  {
    label: "Moliya",
    items: [
      { label: "P&L (Foyda)", href: "/finance/pnl", icon: Wallet, roles: FINANCE_ROLES },
      { label: "Pul oqimi", href: "/finance/cashflow", icon: Activity, roles: FINANCE_ROLES },
      { label: "Taqsimot (Egalar)", href: "/finance/owners", icon: PieChart, roles: ["super_admin", "owner"] },
      { label: "Hisoblar (Kassa)", href: "/finance/accounts", icon: Landmark, roles: FINANCE_ROLES },
      { label: "Bonuslar", href: "/finance/bonuses", icon: PiggyBank, roles: FINANCE_ROLES },
      { label: "Komissiyalar", href: "/finance/commissions", icon: Percent, roles: FINANCE_ROLES },
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
  { label: "Panel", href: "/dashboard", icon: LayoutDashboard },
  { label: "Sotuv", href: "/sales", icon: TrendingUp },
  { label: "Leadlar", href: "/leads", icon: UserSquare2 },
  { label: "P&L", href: "/finance/pnl", icon: Wallet, roles: FINANCE_ROLES },
  { label: "Vazifa", href: "/tasks/my", icon: CheckSquare },
];

export function visibleMobileNav(role: UserRole | null): NavItem[] {
  if (!role) return [];
  return MOBILE_NAV.filter((i) => !i.roles || i.roles.includes(role));
}
