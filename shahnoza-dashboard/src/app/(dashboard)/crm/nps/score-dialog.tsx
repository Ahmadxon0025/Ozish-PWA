"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ScoreDialog({
  npsId,
  studentName,
}: {
  npsId: string;
  studentName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ball, setBall] = useState("");
  const [izoh, setIzoh] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setBall("");
    setIzoh("");
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = Number(ball);
    if (!Number.isInteger(n) || n < 0 || n > 10) {
      setError("Ball 0–10 orasida butun son bo'lishi kerak");
      return;
    }
    if (n < 7 && !izoh.trim()) {
      setError("Past ball uchun izoh majburiy");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/nps/${npsId}/score`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ball: n,
          izoh: izoh.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Saqlanmadi");
        return;
      }
      resetForm();
      setOpen(false);
      router.refresh();
    } catch {
      setError("Saqlanmadi");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Ball berish
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>NPS — {studentName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`nps-ball-${npsId}`}>Ball (0–10)</Label>
            <Input
              id={`nps-ball-${npsId}`}
              type="number"
              min={0}
              max={10}
              step={1}
              value={ball}
              onChange={(e) => setBall(e.target.value)}
              disabled={pending}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`nps-izoh-${npsId}`}>
              Izoh{Number(ball) < 7 && ball !== "" ? " (majburiy)" : ""}
            </Label>
            <Textarea
              id={`nps-izoh-${npsId}`}
              value={izoh}
              onChange={(e) => setIzoh(e.target.value)}
              disabled={pending}
              placeholder="Izoh..."
              rows={3}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Saqlash
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
