"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/marketing/funnel-bot", label: "Tahlil" },
  { href: "/marketing/funnel-bot/editor", label: "Muharrir" },
  { href: "/marketing/funnel-bot/contacts", label: "Kontaktlar" },
  { href: "/marketing/funnel-bot/inbox", label: "Suhbatlar" },
  { href: "/marketing/funnel-bot/broadcasts", label: "Xabar yuborish" },
];

/** ManyChat-style section tabs for the funnel bot area. */
export function FunnelBotTabs() {
  const path = usePathname();
  return (
    <div className="flex gap-1 border-b">
      {TABS.map((t) => {
        const active = path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
