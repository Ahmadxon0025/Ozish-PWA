"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HARAKAT_LABELS,
  MANUAL_LOG_HARAKAT,
  type ManualLogHarakat,
} from "@/lib/crm/constants";

export function AddLogForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [harakat, setHarakat] = useState<ManualLogHarakat>("qongiroq");
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
          harakat,
          izoh: izoh.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Yozilmadi");
        return;
      }
      setIzoh("");
      setHarakat("qongiroq");
      router.refresh();
    } catch {
      setError("Yozilmadi");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label>Harakat</Label>
          <Select
            value={harakat}
            onValueChange={(v) => setHarakat(v as ManualLogHarakat)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MANUAL_LOG_HARAKAT.map((action) => (
                <SelectItem key={action} value={action}>
                  {HARAKAT_LABELS[action]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="log-izoh">Izoh</Label>
          <textarea
            id="log-izoh"
            value={izoh}
            onChange={(e) => setIzoh(e.target.value)}
            rows={2}
            placeholder="Ixtiyoriy izoh..."
            className="flex min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <Button type="submit" disabled={pending}>
          Qo&apos;shish
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}
