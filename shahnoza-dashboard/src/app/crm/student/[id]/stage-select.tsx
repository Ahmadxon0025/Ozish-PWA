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
import { STUDENT_STAGE_LABELS, STUDENT_STAGES } from "@/lib/crm/constants";
import type { StudentStage } from "@/types/crm";

export function StudentStageSelect({
  studentId,
  current,
}: {
  studentId: string;
  current: StudentStage;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: string) {
    if (next === current) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/student/${studentId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: next }),
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
          {STUDENT_STAGES.map((stage) => (
            <SelectItem key={stage} value={stage}>
              {STUDENT_STAGE_LABELS[stage]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
