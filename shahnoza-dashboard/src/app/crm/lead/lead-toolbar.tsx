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
import { ALL_STAGES, BOSQICH_LABELS, TARIF_OPTIONS } from "@/lib/crm/constants";
import type { LeadStage, Tarif } from "@/types/crm";

export function LeadToolbar({
  q,
  bosqich,
  tarif,
}: {
  q: string;
  bosqich: string;
  tarif: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function pushParams(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    router.push(qs ? `/crm/lead?${qs}` : "/crm/lead");
  }

  return (
    <div className="space-y-3">
      <form
        className="flex flex-col gap-2 sm:flex-row"
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
          placeholder="Ism yoki telefon..."
          className="sm:max-w-sm"
        />
        <Button type="submit" variant="secondary">
          Qidirish
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        <Select
          value={bosqich || "all"}
          onValueChange={(value) =>
            pushParams({ bosqich: value === "all" ? "" : value })
          }
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Bosqich" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha bosqichlar</SelectItem>
            {ALL_STAGES.map((stage: LeadStage) => (
              <SelectItem key={stage} value={stage}>
                {BOSQICH_LABELS[stage]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={tarif || "all"}
          onValueChange={(value) =>
            pushParams({ tarif: value === "all" ? "" : value })
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tarif" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha tariflar</SelectItem>
            {TARIF_OPTIONS.map((t: Tarif) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
