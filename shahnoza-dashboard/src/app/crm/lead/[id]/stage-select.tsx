"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_STAGES, BOSQICH_LABELS } from "@/lib/crm/constants";
import type { LeadStage } from "@/types/crm";

export function StageSelect({
  leadId,
  current,
}: {
  leadId: string;
  current: LeadStage;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: string) {
    if (next === current) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/lead/${leadId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bosqich: next }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Bosqich o'zgarmadi");
        return;
      }
      router.refresh();
    } catch {
      setError("Bosqich o'zgarmadi");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1">
      <Select value={current} onValueChange={onChange} disabled={pending}>
        <SelectTrigger>
          <SelectValue placeholder="Bosqich" />
        </SelectTrigger>
        <SelectContent>
          {ALL_STAGES.map((stage) => (
            <SelectItem key={stage} value={stage}>
              {BOSQICH_LABELS[stage]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
