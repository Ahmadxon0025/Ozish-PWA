"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/crm/bugun", label: "Bugun" },
  { href: "/crm/sotuv", label: "Sotuv" },
  { href: "/crm/lead", label: "Leadlar" },
  { href: "/crm/oquvchi", label: "Oquvchilar", also: "/crm/student" },
  { href: "/crm/nps", label: "NPS" },
  { href: "/crm/shahnoza", label: "Shahnoza" },
  { href: "/crm/config", label: "Config" },
] as const;

export function CrmNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 p-3">
      {LINKS.map((link) => {
        const extra = "also" in link ? link.also : undefined;
        const active =
          pathname === link.href ||
          pathname.startsWith(`${link.href}/`) ||
          (extra != null &&
            (pathname === extra || pathname.startsWith(`${extra}/`)));
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
