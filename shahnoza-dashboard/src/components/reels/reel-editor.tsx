"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { STATUS, CHANNELS, type Reel } from "./reel-shared";

/** The expandable edit panel for a reel — shared by the list and card views. */
export function ReelEditor({ reel, onChanged }: { reel: Reel; onChanged: () => void }) {
  const [script, setScript] = useState(reel.script ?? "");
  const [ref, setRef] = useState(reel.reference_link ?? "");
  const [pub, setPub] = useState(reel.published_link ?? "");
  const [notes, setNotes] = useState(reel.notes ?? "");
  useEffect(() => {
    setScript(reel.script ?? "");
    setRef(reel.reference_link ?? "");
    setPub(reel.published_link ?? "");
    setNotes(reel.notes ?? "");
  }, [reel.id, reel.script, reel.reference_link, reel.published_link, reel.notes]);

  const update = api.reels.update.useMutation({
    onSuccess: onChanged,
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  const del = api.reels.delete.useMutation({
    onSuccess: () => {
      toast({ title: "O'chirildi" });
      onChanged();
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  const platforms = reel.platforms ?? [];
  const dirty =
    script !== (reel.script ?? "") ||
    ref !== (reel.reference_link ?? "") ||
    pub !== (reel.published_link ?? "") ||
    notes !== (reel.notes ?? "");

  const toggleChannel = (value: string) => {
    const next = platforms.includes(value)
      ? platforms.filter((p) => p !== value)
      : [...platforms, value];
    update.mutate({ id: reel.id, platforms: next });
  };

  return (
    <div className="space-y-3 border-t bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={reel.status} onValueChange={(v) => update.mutate({ id: reel.id, status: v as never })}>
          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={reel.scheduled_date ?? ""}
          onChange={(e) => update.mutate({ id: reel.id, scheduledDate: e.target.value || null })}
          className="h-8 w-40 text-xs"
          title="Sana"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Kanallar</label>
        <div className="flex flex-wrap gap-1.5">
          {CHANNELS.map((c) => {
            const on = platforms.includes(c.value);
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => toggleChannel(c.value)}
                className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors ${
                  on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                <c.icon className="h-3.5 w-3.5" /> {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Ssenariy (script)</label>
        <textarea
          rows={5}
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="Reel matni / ssenariy: hook, asosiy fikr, CTA…"
          className="w-full rounded-md border border-input bg-transparent p-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Namuna havolasi (reference)</label>
          <div className="flex gap-1.5">
            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="https://… (o'xshash reel)" className="h-8 text-xs" />
            {ref && (
              <Button asChild variant="outline" size="icon" className="h-8 w-8 shrink-0">
                <a href={ref} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
              </Button>
            )}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Chop etilgan havola (live)</label>
          <div className="flex gap-1.5">
            <Input value={pub} onChange={(e) => setPub(e.target.value)} placeholder="https://… (chiqqan reel)" className="h-8 text-xs" />
            {pub && (
              <Button asChild variant="outline" size="icon" className="h-8 w-8 shrink-0">
                <a href={pub} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Izoh</label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Qo'shimcha eslatma" className="h-8 text-xs" />
      </div>

      <div className="flex items-center justify-between">
        <Button
          size="sm"
          disabled={!dirty || update.isPending}
          onClick={() =>
            update.mutate({
              id: reel.id,
              script,
              referenceLink: ref || null,
              publishedLink: pub || null,
              notes: notes || null,
            })
          }
        >
          Saqlash
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive"
          onClick={() => {
            if (confirm(`"${reel.title}" o'chirilsinmi?`)) del.mutate({ id: reel.id });
          }}
          aria-label="O'chirish"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
