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
import { toast } from "@/hooks/use-toast";
import type { CrmCloser } from "@/lib/crm/users";

const UNASSIGNED = "none";

export function AssigneeSelect({
  leadId,
  closers,
  currentId,
}: {
  leadId: string;
  closers: CrmCloser[];
  currentId: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const value = currentId ?? UNASSIGNED;

  async function onChange(next: string) {
    const sotuvchi_id = next === UNASSIGNED ? null : next;
    if (sotuvchi_id === currentId || (sotuvchi_id === null && !currentId)) return;

    setPending(true);
    try {
      const res = await fetch(`/api/crm/lead/${leadId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sotuvchi_id }),
      });
      const json = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok || !json.ok) {
        toast({
          title: "Xatolik",
          description: json.error ?? "Tayinlanmadi",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Mas'ul yangilandi", variant: "success" });
      router.refresh();
    } catch {
      toast({
        title: "Xatolik",
        description: "Tayinlanmadi",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-w-[11rem]">
      <p className="mb-1 text-xs text-muted-foreground">Mas&apos;ul</p>
      <Select value={value} onValueChange={onChange} disabled={pending}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="Tayinlanmagan" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGNED}>Tayinlanmagan</SelectItem>
          {closers.map((closer) => (
            <SelectItem key={closer.id} value={closer.id}>
              {closer.full_name || closer.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
