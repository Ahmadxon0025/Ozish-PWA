"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "izoh", label: "Izoh" },
  { id: "qongiroq", label: "Qo'ng'iroq" },
  { id: "vazifa", label: "Vazifa" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AddLogForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("izoh");
  const [izoh, setIzoh] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/lead/${leadId}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          harakat: tab,
          izoh: izoh.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Yozilmadi");
        return;
      }
      setIzoh("");
      router.refresh();
    } catch {
      setError("Yozilmadi");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border bg-card">
      <div className="flex border-b">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "px-3 py-2 text-xs font-medium",
              tab === item.id
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="space-y-2 p-3">
        <Textarea
          value={izoh}
          onChange={(e) => setIzoh(e.target.value)}
          rows={3}
          placeholder={
            tab === "vazifa"
              ? "Vazifa matni..."
              : tab === "qongiroq"
                ? "Qo'ng'iroq izohi..."
                : "Izoh yozing..."
          }
          className="min-h-[72px] text-sm"
          disabled={pending}
        />
        <div className="flex items-center justify-end gap-2">
          {error ? <p className="mr-auto text-xs text-destructive">{error}</p> : null}
          <Button type="submit" size="sm" disabled={pending}>
            Qo&apos;shish
          </Button>
        </div>
      </div>
    </form>
  );
}
