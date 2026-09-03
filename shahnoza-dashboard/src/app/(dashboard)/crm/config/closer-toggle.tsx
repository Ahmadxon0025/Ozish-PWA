"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CloserToggle({
  closerId,
  isActive,
}: {
  closerId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState(isActive);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !active;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/config/closer/${closerId}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: next }),
      });
      const json = (await res.json()) as { error?: string; is_active?: boolean };
      if (!res.ok) {
        setError(json.error ?? "Yangilanmadi");
        return;
      }
      setActive(json.is_active ?? next);
      router.refresh();
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
        variant={active ? "default" : "outline"}
        disabled={pending}
        onClick={() => void toggle()}
      >
        {active ? "Faol" : "Nofaol"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
