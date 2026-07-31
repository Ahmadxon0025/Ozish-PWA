"use client";

import { useEffect, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  ExternalLink,
  Phone,
  Star,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import { STATUS, statusMeta, CHANNELS, ChannelChips, type Reel } from "./reel-shared";
import { ReelEditor } from "./reel-editor";

const COLS =
  "grid grid-cols-[9rem_minmax(12rem,1fr)_8.5rem_11rem_7rem_3rem] items-center gap-3";

/** Small colored status pill that changes status inline (jumps groups). */
function StatusSelect({ reel, onChanged }: { reel: Reel; onChanged: () => void }) {
  const update = api.reels.update.useMutation({
    onSuccess: onChanged,
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  const meta = statusMeta(reel.status);
  return (
    <Select
      value={reel.status}
      onValueChange={(v) => update.mutate({ id: reel.id, status: v as never })}
    >
      <SelectTrigger className="h-7 w-full border-0 bg-transparent px-1 shadow-none focus:ring-0">
        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${meta.pill}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
      </SelectTrigger>
      <SelectContent>
        {STATUS.map((s) => (
          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Click-to-toggle channel chips (popover). */
function ChannelCell({ reel, onChanged }: { reel: Reel; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const update = api.reels.update.useMutation({
    onSuccess: onChanged,
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  const platforms = reel.platforms ?? [];
  const toggle = (v: string) =>
    update.mutate({
      id: reel.id,
      platforms: platforms.includes(v) ? platforms.filter((p) => p !== v) : [...platforms, v],
    });
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded px-1 py-0.5 text-left hover:bg-muted"
        title="Kanallarni tahrirlash"
      >
        <ChannelChips platforms={reel.platforms} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-md border bg-popover p-2 shadow-md">
            <div className="flex flex-wrap gap-1">
              {CHANNELS.map((c) => {
                const on = platforms.includes(c.value);
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => toggle(c.value)}
                    className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition-colors ${
                      on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <c.icon className="h-3 w-3" /> {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Click-to-edit single-line text (name / cta). */
function InlineText({
  value,
  placeholder,
  onSave,
  className,
  children,
}: {
  value: string;
  placeholder?: string;
  onSave: (v: string) => void;
  className?: string;
  children: React.ReactNode; // the read view
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft.trim() !== value) onSave(draft.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        placeholder={placeholder}
        className={`w-full rounded border border-input bg-background px-1.5 py-1 text-sm outline-none focus:ring-1 focus:ring-ring ${className ?? ""}`}
      />
    );
  }
  return (
    <button type="button" onClick={() => setEditing(true)} className="w-full rounded px-1 py-0.5 text-left hover:bg-muted">
      {children}
    </button>
  );
}

function Row({
  reel,
  expanded,
  onToggleExpand,
  onChanged,
}: {
  reel: Reel;
  expanded: boolean;
  onToggleExpand: () => void;
  onChanged: () => void;
}) {
  const update = api.reels.update.useMutation({
    onSuccess: onChanged,
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="border-b last:border-b-0">
      <div className={`${COLS} px-3 py-1.5 text-sm`}>
        {/* Status */}
        <StatusSelect reel={reel} onChanged={onChanged} />

        {/* Name (click to rename) */}
        <div className="min-w-0">
          <InlineText value={reel.title} onSave={(v) => v && update.mutate({ id: reel.id, title: v })}>
            <div className="flex items-center gap-1.5">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary/10 text-[9px] font-bold text-primary">
                {reel.seq ?? "—"}
              </span>
              <span className="truncate font-medium">{reel.title}</span>
              {reel.is_low_prod && <Phone className="h-3 w-3 shrink-0 text-muted-foreground" />}
              {reel.script && <Star className="h-3 w-3 shrink-0 text-amber-500" />}
            </div>
          </InlineText>
          <div className="flex items-center gap-1.5 pl-1 text-[10px] text-muted-foreground">
            {reel.stage && <span className="truncate">{reel.stage}</span>}
            {reel.production_batch && (
              <span className="rounded bg-muted px-1 py-0.5">Syomka {reel.production_batch}</span>
            )}
          </div>
        </div>

        {/* Date (inline) */}
        <input
          type="date"
          value={reel.scheduled_date ?? ""}
          onChange={(e) => update.mutate({ id: reel.id, scheduledDate: e.target.value || null })}
          className="h-7 rounded border border-transparent bg-transparent px-1 text-xs text-muted-foreground hover:border-input"
        />

        {/* Channels (popover) */}
        <ChannelCell reel={reel} onChanged={onChanged} />

        {/* CTA (click to edit) */}
        <InlineText
          value={reel.cta ?? ""}
          placeholder="CTA"
          onSave={(v) => update.mutate({ id: reel.id, cta: v || null })}
        >
          {reel.cta ? (
            <Badge variant="outline" className="text-[10px]">{reel.cta}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </InlineText>

        {/* Link + expand */}
        <span className="flex items-center justify-end gap-1">
          {reel.published_link && (
            <a
              href={reel.published_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
              title="Chop etilgan havola"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={onToggleExpand}
            className="text-muted-foreground hover:text-foreground"
            title="Ssenariy / havolalar"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </span>
      </div>
      {expanded && <ReelEditor reel={reel} onChanged={onChanged} />}
    </div>
  );
}

/** ClickUp-style list: reels grouped by status, cells edit inline. */
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
  for (const r of reels) (byStatus.get(r.status) ?? byStatus.get("reja"))!.push(r);
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
      <div className="min-w-[920px] space-y-3">
        {STATUS.map((s) => {
          const list = byStatus.get(s.value) ?? [];
          const isCollapsed = collapsed.has(s.value);
          return (
            <div key={s.value} className="overflow-hidden rounded-xl border">
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
                  <div className={`${COLS} border-b bg-background px-3 py-1.5 text-[11px] font-medium text-muted-foreground`}>
                    <span>Holat</span>
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
                      expanded={openId === r.id}
                      onToggleExpand={() => setOpenId((o) => (o === r.id ? null : r.id))}
                      onChanged={onChanged}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => onAdd(s.value)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" /> Element qo&apos;shish
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
