"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";
import { navItemActive, visibleNav } from "@/lib/nav";
import { APP_NAME } from "@/lib/constants";
import { Stethoscope } from "lucide-react";
import type { UserRole } from "@/types/database";
import { useSidebarCollapsed } from "./sidebar-store";

const MIN_W = 190;
const MAX_W = 440;
const DEFAULT_W = 256;
const WIDTH_KEY = "sidebar-width";
const clamp = (v: number) => Math.min(MAX_W, Math.max(MIN_W, v));

export function Sidebar({ role }: { role: UserRole | null }) {
  const pathname = usePathname();
  const groups = visibleNav(role);
  const [collapsed] = useSidebarCollapsed();

  const [width, setWidth] = useState(DEFAULT_W);
  const drag = useRef<{ sx: number; ow: number } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WIDTH_KEY);
      if (raw) setWidth(clamp(Number(raw) || DEFAULT_W));
    } catch {
      /* ignore */
    }
  }, []);

  function onDown(e: ReactPointerEvent) {
    e.preventDefault();
    try { (e.target as Element).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    drag.current = { sx: e.clientX, ow: width };
  }
  function onMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    setWidth(clamp(d.ow + (e.clientX - d.sx)));
  }
  function onUp() {
    if (!drag.current) return;
    drag.current = null;
    setWidth((w) => {
      try { localStorage.setItem(WIDTH_KEY, String(w)); } catch { /* ignore */ }
      return w;
    });
  }
  function reset() {
    setWidth(DEFAULT_W);
    try { localStorage.setItem(WIDTH_KEY, String(DEFAULT_W)); } catch { /* ignore */ }
  }

  if (collapsed) return null;

  return (
    <aside className="relative hidden h-dvh shrink-0 flex-col border-r bg-card lg:flex" style={{ width }}>
      <div className="flex h-16 items-center gap-2 border-b px-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Stethoscope className="h-5 w-5" />
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold">{APP_NAME}</div>
          <div className="truncate text-xs text-muted-foreground">Shahnoza Reabilitolog</div>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto p-4">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </div>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active = navItemActive(pathname, item);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* drag handle: resize the sidebar; double-click resets to default */}
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={reset}
        title="Kengligini o'zgartirish uchun suring · ikki marta bosib asliga qaytadi"
        className="group absolute right-0 top-0 z-10 flex h-full w-2 cursor-col-resize touch-none items-center justify-center hover:bg-primary/5"
      >
        <div className="h-10 w-[3px] rounded-full bg-border transition-colors group-hover:bg-primary/50" />
      </div>
    </aside>
  );
}
