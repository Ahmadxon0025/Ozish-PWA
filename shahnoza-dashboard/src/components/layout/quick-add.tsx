"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Plus,
  ListTodo,
  Receipt,
  DollarSign,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { OWNER_ONLY } from "@/lib/role-check";
import type { UserRole } from "@/types/database";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { toast } from "@/hooks/use-toast";

const pill =
  "flex items-center gap-2 rounded-full border bg-card px-4 py-2.5 text-sm font-medium shadow-md hover:bg-muted";

/** Compact "quick expense" — amount + category + account, one screen. */
function QuickExpenseDialog({
  trigger,
  onDone,
}: {
  trigger: ReactNode;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const cats = api.expenses.categories.useQuery(undefined, { enabled: open });
  const accounts = api.accounts.list.useQuery(undefined, { enabled: open });
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"USD" | "UZS">("UZS");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [description, setDescription] = useState("");

  const reset = () => {
    setAmount("");
    setCategoryId("");
    setAccountId("");
    setDescription("");
  };
  const create = api.expenses.create.useMutation({
    onSuccess: () => {
      toast({ title: "Xarajat qo'shildi", variant: "success" });
      reset();
      setOpen(false);
      onDone();
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  const submit = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast({ title: "Summani kiriting", variant: "destructive" });
      return;
    }
    if (!categoryId) {
      toast({ title: "Kategoriya tanlang", variant: "destructive" });
      return;
    }
    const today = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
    create.mutate({
      categoryId,
      amount: amt,
      currency,
      description: description || undefined,
      expenseDate: today,
      accountId: accountId || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tezkor xarajat</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Summa</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valyuta</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as "USD" | "UZS")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UZS">so&apos;m (UZS)</SelectItem>
                  <SelectItem value="USD">dollar (USD)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Kategoriya</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Tanlang" />
              </SelectTrigger>
              <SelectContent>
                {(cats.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Hisob (qaysi hisobdan)</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Standart hisob" />
              </SelectTrigger>
              <SelectContent>
                {(accounts.data?.items ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Izoh</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ixtiyoriy"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Bekor</Button>
          </DialogClose>
          <Button disabled={create.isPending} onClick={submit}>
            {create.isPending ? "Saqlanmoqda…" : "Saqlash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Floating quick-add: Task / Expense (dialogs) + Sale / Lead (navigate). */
export function QuickAdd() {
  const [menu, setMenu] = useState(false);
  const close = () => setMenu(false);
  const me = api.users.me.useQuery();
  const isOwner = me.data && OWNER_ONLY.includes(me.data.role as UserRole);

  return (
    <>
      {menu && (
        <button
          aria-label="Yopish"
          className="fixed inset-0 z-40 cursor-default"
          onClick={close}
        />
      )}
      <div className="fixed bottom-24 right-4 z-50 flex flex-col items-end gap-2 lg:bottom-6">
        {menu && (
          <div className="flex flex-col items-end gap-2">
            <TaskFormDialog
              onSaved={close}
              trigger={
                <button className={pill}>
                  <ListTodo className="h-4 w-4" /> Vazifa
                </button>
              }
            />
            {isOwner && (
              <QuickExpenseDialog
                onDone={close}
                trigger={
                  <button className={pill}>
                    <Receipt className="h-4 w-4" /> Xarajat
                  </button>
                }
              />
            )}
            <Link href="/sales" onClick={close} className={pill}>
              <DollarSign className="h-4 w-4" /> Sotuv
            </Link>
          </div>
        )}
        <button
          onClick={() => setMenu((v) => !v)}
          aria-label="Tezkor qo'shish"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition active:scale-95"
        >
          <Plus className={cn("h-6 w-6 transition-transform", menu && "rotate-45")} />
        </button>
      </div>
    </>
  );
}
