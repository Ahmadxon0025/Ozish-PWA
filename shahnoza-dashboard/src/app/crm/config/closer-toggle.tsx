"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CloserToggle({
  closerId,
  isActive,
}: {
  closerId: string;
  isActive: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/config/closer/${closerId}/toggle`, {
        method: "PATCH",
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Yangilanmadi");
      }
    } catch {
      setError("Yangilanmadi");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant={isActive ? "default" : "outline"}
        disabled={pending}
        onClick={() => void toggle()}
      >
        {isActive ? "Faol" : "Nofaol"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
