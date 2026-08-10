"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/marketing/funnel-bot", label: "Tahlil", exact: true },
  { href: "/marketing/funnel-bot/flows", label: "Avtomatlashtirishlar", also: ["/marketing/funnel-bot/flow"] },
  { href: "/marketing/funnel-bot/contacts", label: "Kontaktlar" },
  { href: "/marketing/funnel-bot/inbox", label: "Suhbatlar" },
  { href: "/marketing/funnel-bot/broadcasts", label: "Xabar yuborish" },
];

/** ManyChat-style section tabs for the funnel bot area. */
export function FunnelBotTabs() {
  const path = usePathname();
  return (
    <div className="flex gap-1 border-b overflow-x-auto">
      {TABS.map((t) => {
        const active = t.exact
          ? path === t.href
          : path.startsWith(t.href) || (t.also ?? []).some((a) => path.startsWith(a));
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
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
