"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ListOrdered,
  KanbanSquare,
  PieChart,
  Inbox,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/leads", label: "Ro'yxat", icon: ListOrdered },
  { href: "/leads/queue", label: "Navbat", icon: Inbox },
  { href: "/leads/board", label: "Doska", icon: KanbanSquare },
  { href: "/leads/analytics", label: "Tahlil", icon: PieChart },
  { href: "/leads/debtors", label: "Qarzdor", icon: AlertTriangle },
];

/** Sub-navigation shared by the three lead views (list / board / analytics). */
export function LeadTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b">
      {TABS.map((t) => {
        const active = pathname === t.href;
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" /> {t.label}
          </Link>
        );
      })}
    </div>
  );
}
