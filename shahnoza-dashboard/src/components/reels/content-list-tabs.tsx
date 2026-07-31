"use client";

import { useState } from "react";
import { Plus, Trash2, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";

type ContentList = inferRouterOutputs<AppRouter>["reels"]["lists"][number];

/** ClickUp-style horizontal list picker for the content hub. */
export function ContentListTabs({
  lists,
  counts,
  selected,
  onSelect,
  onCreate,
  onDelete,
  busy,
}: {
  lists: ContentList[];
  counts: Record<string, number>;
  selected: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
  busy?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const submit = () => {
    const n = name.trim();
    if (n) onCreate(n);
    setName("");
    setAdding(false);
  };

  return (
    <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1">
      {lists.map((l) => {
        const active = l.id === selected;
        return (
          <div
            key={l.id}
            className={`group flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            <button type="button" className="flex items-center gap-1.5" onClick={() => onSelect(l.id)}>
              {l.emoji && <span>{l.emoji}</span>}
              <span className="font-medium">{l.name}</span>
              <span className={`text-xs ${active ? "text-primary/70" : "text-muted-foreground"}`}>
                {counts[l.id] ?? 0}
              </span>
            </button>
            {active && (
              <button
                type="button"
                title="Ro'yxatni o'chirish"
                className="text-muted-foreground hover:text-destructive"
                disabled={busy}
                onClick={() => {
                  const n = counts[l.id] ?? 0;
                  if (
                    confirm(
                      `"${l.name}" ro'yxati va undagi ${n} ta element o'chirilsinmi? Bu qaytarib bo'lmaydi.`,
                    )
                  )
                    onDelete(l.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}

      {adding ? (
        <div className="flex shrink-0 items-center gap-1">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") { setAdding(false); setName(""); }
            }}
            placeholder="Ro'yxat nomi"
            className="h-9 w-40"
          />
          <button type="button" onClick={submit} className="text-success hover:opacity-80" title="Qo'shish">
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setName(""); }}
            className="text-muted-foreground hover:text-foreground"
            title="Bekor"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-dashed px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <Plus className="h-4 w-4" /> Ro&apos;yxat
        </button>
      )}
    </div>
  );
}
