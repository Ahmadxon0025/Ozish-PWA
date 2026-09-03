"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { Tarif } from "@/types/crm";

export function ConvertButton({
  leadId,
  tarif,
}: {
  leadId: string;
  tarif: Tarif;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/lead/${leadId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tarif,
          amount: 0,
          payment_type: "Naqd",
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        student_id?: string;
      };
      if (!res.ok || !json.student_id) {
        setError(json.error ?? "O'quvchi yaratilmadi");
        return;
      }
      router.push(`/crm/student/${json.student_id}`);
    } catch {
      setError("O'quvchi yaratilmadi");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        disabled={pending}
        onClick={onClick}
        className="bg-emerald-600 text-white hover:bg-emerald-700"
      >
        Oquvchi qil →
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
