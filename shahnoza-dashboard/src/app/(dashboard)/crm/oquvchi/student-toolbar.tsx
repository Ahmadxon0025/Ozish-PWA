"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STUDENT_STAGE_LABELS, STUDENT_STAGES } from "@/lib/crm/constants";
import type { StudentStage } from "@/types/crm";

export function StudentToolbar({ q, stage }: { q: string; stage: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function pushParams(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    router.push(qs ? `/crm/oquvchi?${qs}` : "/crm/oquvchi");
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <form
        className="flex flex-1 flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const value = String(new FormData(form).get("q") ?? "").trim();
          pushParams({ q: value });
        }}
      >
        <Input
          name="q"
          defaultValue={q}
          placeholder="Ism..."
          className="sm:max-w-sm"
        />
        <Button type="submit" variant="secondary">
          Qidirish
        </Button>
      </form>

      <Select
        value={stage || "all"}
        onValueChange={(value) => pushParams({ stage: value === "all" ? "" : value })}
      >
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="Bosqich" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Barcha bosqichlar</SelectItem>
          {STUDENT_STAGES.map((s: StudentStage) => (
            <SelectItem key={s} value={s}>
              {STUDENT_STAGE_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
