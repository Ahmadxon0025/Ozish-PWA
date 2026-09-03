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
import { BOSQICH_LABELS, PIPELINE_STAGES } from "@/lib/crm/constants";
import type { LeadStage } from "@/types/crm";

export function MoveStage({
  leadId,
  current,
}: {
  leadId: string;
  current: LeadStage;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function onChange(next: string) {
    if (next === current) return;
    setPending(true);
    try {
      await fetch(`/api/crm/lead/${leadId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bosqich: next }),
      });
      router.refresh();
    } finally {
      setPending(false);
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
      >
        Move →
      </button>
    );
  }

  return (
    <Select value={current} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder="Bosqich" />
      </SelectTrigger>
      <SelectContent>
        {PIPELINE_STAGES.map((stage) => (
          <SelectItem key={stage} value={stage}>
            {BOSQICH_LABELS[stage]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
