"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { PaymentStatus } from "@/types/crm";

export function PaymentActions({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<PaymentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(status: "confirmed" | "refunded") {
    setPending(status);
    setError(null);
    try {
      const res = await fetch("/api/crm/payment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_id: paymentId, status }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Yangilanmadi");
        return;
      }
      router.refresh();
    } catch {
      setError("Yangilanmadi");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        disabled={pending != null}
        onClick={() => setStatus("confirmed")}
      >
        Tasdiqlash
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending != null}
        onClick={() => setStatus("refunded")}
      >
        Qaytarish
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
