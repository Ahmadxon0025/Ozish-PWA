"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NextContactInput({
  leadId,
  value,
}: {
  leadId: string;
  value: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: string) {
    if (!next) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/lead/${leadId}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          harakat: "rejalashtirildi",
          keyingi_aloqa: next,
          izoh: `Keyingi aloqa: ${next}`,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Saqlanmadi");
        return;
      }
      router.refresh();
    } catch {
      setError("Saqlanmadi");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="keyingi-aloqa">Keyingi aloqa</Label>
      <Input
        id="keyingi-aloqa"
        type="date"
        defaultValue={value?.slice(0, 10) ?? ""}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
