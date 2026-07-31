"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, Plus, ExternalLink, Phone, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { STATUS, ChannelChips, type Reel } from "./reel-shared";
import { ReelEditor } from "./reel-editor";

const COLS = "grid grid-cols-[1.75rem_minmax(12rem,1fr)_6.5rem_11rem_7rem_2.5rem] items-center gap-3";

function Row({
  reel,
  open,
  onToggle,
  onChanged,
}: {
  reel: Reel;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  return (
    <div className="border-b last:border-b-0">
      <div
        className={`${COLS} cursor-pointer px-3 py-2 text-sm transition-colors hover:bg-muted/40`}
        onClick={onToggle}
      >
        <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">
          {reel.seq ?? "—"}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium">{reel.title}</span>
            {reel.is_low_prod && <Phone className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Past prodakshn" />}
            {reel.script && <Star className="h-3 w-3 shrink-0 text-amber-500" aria-label="Ssenariy bor" />}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {reel.stage && <span className="truncate">{reel.stage}</span>}
            {reel.production_batch && (
              <span className="rounded bg-muted px-1 py-0.5">Syomka {reel.production_batch}</span>
            )}
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          {reel.scheduled_date ? formatDate(reel.scheduled_date) : "—"}
        </span>
        <ChannelChips platforms={reel.platforms} />
        <span>
          {reel.cta ? (
            <Badge variant="outline" className="text-[10px]">{reel.cta}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </span>
        <span className="flex items-center justify-end gap-1">
          {reel.published_link && (
            <a
              href={reel.published_link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-foreground"
              title="Chop etilgan havola"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </span>
      </div>
      {open && <ReelEditor reel={reel} onChanged={onChanged} />}
    </div>
  );
}

/** ClickUp-style list: reels grouped by status, each group a colored,
 *  collapsible section with a column header and a "+ Reel" row. */
export function ReelsList({
  reels,
  onChanged,
  onAdd,
}: {
  reels: Reel[];
  onChanged: () => void;
  onAdd: (status: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);

  const byStatus = new Map<string, Reel[]>();
  for (const s of STATUS) byStatus.set(s.value, []);
  for (const r of reels) {
    (byStatus.get(r.status) ?? byStatus.get("reja"))!.push(r);
  }
  for (const [, list] of byStatus) list.sort((a, b) => (a.seq ?? 999) - (b.seq ?? 999));

  const toggleGroup = (s: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px] space-y-3">
        {STATUS.map((s) => {
          const list = byStatus.get(s.value) ?? [];
          const isCollapsed = collapsed.has(s.value);
          return (
            <div key={s.value} className="overflow-hidden rounded-xl border">
              {/* Group header */}
              <button
                type="button"
                onClick={() => toggleGroup(s.value)}
                className="flex w-full items-center gap-2 bg-muted/40 px-3 py-2"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
                <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-semibold ${s.pill}`}>
                  <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                  {s.label.toUpperCase()}
                </span>
                <span className="text-xs text-muted-foreground">{list.length}</span>
              </button>

              {!isCollapsed && (
                <div>
                  {/* Column header */}
                  <div className={`${COLS} border-b bg-background px-3 py-1.5 text-[11px] font-medium text-muted-foreground`}>
                    <span />
                    <span>Nomi</span>
                    <span>Sana</span>
                    <span>Kanal</span>
                    <span>CTA</span>
                    <span className="text-right">Havola</span>
                  </div>
                  {list.map((r) => (
                    <Row
                      key={r.id}
                      reel={r}
                      open={openId === r.id}
                      onToggle={() => setOpenId((o) => (o === r.id ? null : r.id))}
                      onChanged={onChanged}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => onAdd(s.value)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" /> Reel qo&apos;shish
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
