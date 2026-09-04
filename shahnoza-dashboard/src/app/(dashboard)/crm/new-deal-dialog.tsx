"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { MANBA_OPTIONS, TARIF_OPTIONS } from "@/lib/crm/constants";
import type { CrmCloser, CrmCohortOption } from "@/lib/crm/users";
import type { Manba, Tarif } from "@/types/crm";

const UNASSIGNED = "none";

export function NewDealDialog({
  closers,
  cohorts,
  defaultCohortId,
}: {
  closers: CrmCloser[];
  cohorts: CrmCohortOption[];
  defaultCohortId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ism, setIsm] = useState("");
  const [telefon, setTelefon] = useState("");
  const [tarif, setTarif] = useState<Tarif>("BAZA");
  const [manba, setManba] = useState<Manba>("Konsultatsiya");
  const [sotuvchiId, setSotuvchiId] = useState(UNASSIGNED);
  const [cohortId, setCohortId] = useState(defaultCohortId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setIsm("");
    setTelefon("");
    setTarif("BAZA");
    setManba("Konsultatsiya");
    setSotuvchiId(UNASSIGNED);
    setCohortId(defaultCohortId);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!cohortId) {
      setError("Faol kogorta yo'q");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ism: ism.trim(),
          telefon: telefon.trim(),
          tarif,
          manba,
          cohort_id: cohortId,
          sotuvchi_id: sotuvchiId === UNASSIGNED ? undefined : sotuvchiId,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        existing?: boolean;
        lead_id?: string;
      };

      if (json.existing && json.lead_id) {
        toast({
          title: "Bu raqam allaqachon bor",
          description: (
            <Link href={`/crm/lead/${json.lead_id}`} className="underline">
              Mavjud bitimni ochish
            </Link>
          ),
        });
        return;
      }

      if (!res.ok || !json.lead_id) {
        setError(json.error ?? "Bitim yaratilmadi");
        return;
      }

      resetForm();
      setOpen(false);
      toast({ title: "Bitim yaratildi", variant: "success" });
      router.refresh();
    } catch {
      setError("Bitim yaratilmadi");
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
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          Bitim
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yangi bitim</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="deal-ism">Ism</Label>
            <Input
              id="deal-ism"
              value={ism}
              onChange={(e) => setIsm(e.target.value)}
              required
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deal-telefon">Telefon</Label>
            <Input
              id="deal-telefon"
              value={telefon}
              onChange={(e) => setTelefon(e.target.value)}
              required
              disabled={pending}
              placeholder="+998..."
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tarif</Label>
              <Select
                value={tarif}
                onValueChange={(v) => setTarif(v as Tarif)}
                disabled={pending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TARIF_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Manba</Label>
              <Select
                value={manba}
                onValueChange={(v) => setManba(v as Manba)}
                disabled={pending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANBA_OPTIONS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Mas&apos;ul</Label>
            <Select
              value={sotuvchiId}
              onValueChange={setSotuvchiId}
              disabled={pending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Ixtiyoriy" />
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
          <div className="space-y-1.5">
            <Label>Kogorta</Label>
            <Select
              value={cohortId || undefined}
              onValueChange={setCohortId}
              disabled={pending || cohorts.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Faol kogorta yo'q" />
              </SelectTrigger>
              <SelectContent>
                {cohorts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending || !cohortId}>
              Yaratish
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
