"use client";

import { useState } from "react";
import { Plus, Check, Trash2, CalendarClock } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUzs, formatDate } from "@/lib/format";
import { toast } from "@/hooks/use-toast";

/** Instalment schedule + collection for one lead (Track B). */
export function PaymentsPanel({ leadId }: { leadId: string }) {
  const utils = api.useUtils();
  const q = api.payments.byLead.useQuery({ leadId });
  const rows = q.data ?? [];

  const [amount, setAmount] = useState("");
  const [due, setDue] = useState("");
  const [payNow, setPayNow] = useState(false);

  const refresh = () => {
    utils.payments.byLead.invalidate({ leadId });
    utils.payments.summary.invalidate();
  };
  const onErr = (e: { message: string }) =>
    toast({ title: "Xato", description: e.message, variant: "destructive" });

  const add = api.payments.add.useMutation({
    onSuccess: () => {
      refresh();
      setAmount("");
      setDue("");
      setPayNow(false);
      toast({ title: "Qo'shildi", variant: "success" });
    },
    onError: onErr,
  });
  const markPaid = api.payments.markPaid.useMutation({ onSuccess: refresh, onError: onErr });
  const remove = api.payments.remove.useMutation({ onSuccess: refresh, onError: onErr });

  const collected = rows.filter((r) => r.status === "paid").reduce((s, r) => s + Number(r.amount_uzs ?? 0), 0);
  const outstanding = rows.filter((r) => r.status !== "paid").reduce((s, r) => s + Number(r.amount_uzs ?? 0), 0);
  const contracted = collected + outstanding;
  const pct = contracted > 0 ? Math.round((collected / contracted) * 100) : 0;
  const amt = Number(amount) || 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-primary" /> To&apos;lov jadvali
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Collection summary */}
        {contracted > 0 && (
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-success">Yig&apos;ildi: {formatUzs(collected)}</span>
              <span className="text-muted-foreground">Qoldiq: {formatUzs(outstanding)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-success" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-right text-xs text-muted-foreground">{pct}% yig&apos;ildi</p>
          </div>
        )}

        {/* Schedule list */}
        {q.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Hali to&apos;lov rejasi yo&apos;q. Quyida qo&apos;shing.</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((p, i) => {
              const paid = p.status === "paid";
              return (
                <li key={p.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span className="w-5 shrink-0 text-center text-muted-foreground">{p.seq ?? i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{formatUzs(Number(p.amount_uzs ?? 0))}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {paid
                        ? `To'landi · ${formatDate(p.paid_at)}`
                        : p.due_date
                          ? `Muddat: ${formatDate(p.due_date)}`
                          : "Muddatsiz"}
                    </span>
                  </div>
                  {!paid && p.dpd > 0 && (
                    <Badge variant="destructive">{p.dpd} kun kechikdi</Badge>
                  )}
                  {paid ? (
                    <Badge variant="success">✓</Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0"
                      disabled={markPaid.isPending}
                      onClick={() => markPaid.mutate({ id: p.id })}
                    >
                      <Check className="h-3.5 w-3.5" /> To&apos;landi
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-destructive"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ id: p.id })}
                    aria-label="O'chirish"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Add instalment */}
        <div className="grid grid-cols-2 gap-2 border-t pt-3">
          <div className="space-y-1">
            <Label className="text-xs">Summa (so&apos;m)</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="masalan: 1500000"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Muddat</Label>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} />
            Hozir to&apos;langan deb belgilash
          </label>
          <Button
            className="col-span-2"
            disabled={amt <= 0 || add.isPending}
            onClick={() =>
              add.mutate({
                leadId,
                amountUzs: amt,
                dueDate: due || undefined,
                status: payNow ? "paid" : "pending",
                seq: rows.length + 1,
              })
            }
          >
            <Plus className="h-4 w-4" /> Qo&apos;shish
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
