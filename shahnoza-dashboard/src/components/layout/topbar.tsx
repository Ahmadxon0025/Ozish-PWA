"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Stethoscope } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { UserMenu, type SessionUser } from "./user-menu";
import { visibleNav } from "@/lib/nav";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/database";

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function Topbar({
  user,
  role,
}: {
  user: SessionUser;
  role: UserRole | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const groups = visibleNav(role);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur lg:px-6">
      <div className="flex items-center gap-2">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menyu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 overflow-y-auto p-0">
            <SheetTitle className="sr-only">Navigatsiya</SheetTitle>
            <div className="flex h-16 items-center gap-2 border-b px-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Stethoscope className="h-5 w-5" />
              </div>
              <div className="text-sm font-semibold">{APP_NAME}</div>
            </div>
            <nav className="space-y-6 p-4">
              {groups.map((group) => (
                <div key={group.label}>
                  <div className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </div>
                  <ul className="space-y-1">
                    {group.items.map((item) => {
                      const active = isActive(pathname, item.href);
                      const Icon = item.icon;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => setOpen(false)}
                            className={cn(
                              "flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                              active
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground",
                            )}
                          >
                            <Icon className="h-[18px] w-[18px]" />
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
        <span className="text-base font-semibold lg:hidden">{APP_NAME}</span>
      </div>

      <div className="flex items-center gap-3">
        <UserMenu user={user} />
      </div>
    </header>
  );
}
