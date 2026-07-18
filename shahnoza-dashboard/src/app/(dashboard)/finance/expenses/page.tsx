"use client";

import { useState } from "react";
import { Plus, Receipt, Trash2, Wallet } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  MonthSelect,
  currentMonthValue,
} from "@/components/dashboard/month-select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
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
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { SimpleBarChart } from "@/components/charts/simple-bar-chart";
import { formatUsd, formatDate } from "@/lib/format";
import { toast } from "@/hooks/use-toast";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpensesPage() {
  const [month, setMonth] = useState<string>(currentMonthValue());
  const utils = api.useUtils();

  const categories = api.expenses.categories.useQuery();
  const list = api.expenses.list.useQuery({ month });
  const byCategory = api.expenses.byCategory.useQuery({ month });

  const items = list.data?.items ?? [];
  const chartData = (byCategory.data ?? [])
    .filter((c) => c.amount > 0)
    .map((c) => ({ label: c.name ?? "—", value: c.amount }));

  const del = api.expenses.delete.useMutation({
    onSuccess: () => {
      utils.expenses.list.invalidate();
      utils.expenses.byCategory.invalidate();
      toast({ title: "Xarajat o'chirildi" });
    },
    onError: (e) => {
      toast({ title: "Xatolik", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div>
      <PageHeader
        title="Xarajatlar"
        description="Oylik operatsion xarajatlarni boshqarish."
        actions={
          <div className="flex items-center gap-2">
            <MonthSelect value={month} onChange={setMonth} />
            <AddExpenseDialog
              categories={categories.data ?? []}
              onCreated={() => {
                utils.expenses.list.invalidate();
                utils.expenses.byCategory.invalidate();
              }}
            />
          </div>
        }
      />

      {/* Summary + chart */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid gap-3">
          {list.isLoading || !list.data ? (
            <Skeleton className="h-28 rounded-xl" />
          ) : (
            <KpiCard
              label="Jami xarajat (oy)"
              value={formatUsd(list.data.totalUsd)}
              icon={Wallet}
              tone="warning"
            />
          )}
        </div>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Kategoriya bo'yicha</CardTitle>
            <CardDescription>
              Har bir kategoriya bo'yicha jami xarajat.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {byCategory.isLoading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : chartData.length > 0 ? (
              <SimpleBarChart
                data={chartData}
                valueFormatter={(v) => formatUsd(v)}
              />
            ) : (
              <EmptyState
                icon={Receipt}
                title="Ma'lumot yo'q"
                description="Bu oyda kategoriya bo'yicha xarajat yo'q."
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expenses list */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Xarajatlar ro'yxati</CardTitle>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Xarajatlar yo'q"
              description="Bu oy uchun hali xarajat qo'shilmagan."
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sana</TableHead>
                      <TableHead>Kategoriya</TableHead>
                      <TableHead className="text-right">Summa</TableHead>
                      <TableHead>Tavsif</TableHead>
                      <TableHead>Kim</TableHead>
                      <TableHead className="text-right">Amal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(it.expense_date)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {it.categoryName}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatUsd(it.amount_usd)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {it.description || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {it.createdByName}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-destructive"
                            disabled={del.isPending}
                            onClick={() => del.mutate({ id: it.id })}
                            aria-label="O'chirish"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile stacked cards */}
              <div className="space-y-3 md:hidden">
                {items.map((it) => (
                  <div
                    key={it.id}
                    className="rounded-lg border p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{it.categoryName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(it.expense_date)} · {it.createdByName}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          {formatUsd(it.amount_usd)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-destructive"
                          disabled={del.isPending}
                          onClick={() => del.mutate({ id: it.id })}
                          aria-label="O'chirish"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {it.description && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {it.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AddExpenseDialog({
  categories,
  onCreated,
}: {
  categories: Array<{ id: string; name: string | null }>;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [currency, setCurrency] = useState<"USD" | "UZS">("USD");
  const [expenseDate, setExpenseDate] = useState<string>(today());
  const [description, setDescription] = useState<string>("");
  const [paidTo, setPaidTo] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("auto");
  const accountsQ = api.accounts.list.useQuery();
  const accounts = accountsQ.data?.items ?? [];

  const create = api.expenses.create.useMutation({
    onSuccess: () => {
      toast({ title: "Xarajat qo'shildi" });
      onCreated();
      resetForm();
      setOpen(false);
    },
    onError: (e) => {
      toast({ title: "Xatolik", description: e.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setCategoryId("");
    setAmount("");
    setCurrency("USD");
    setExpenseDate(today());
    setDescription("");
    setPaidTo("");
    setAccountId("auto");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number(amount);
    if (!categoryId) {
      toast({ title: "Kategoriyani tanlang", variant: "destructive" });
      return;
    }
    if (!parsed || parsed <= 0) {
      toast({ title: "To'g'ri summa kiriting", variant: "destructive" });
      return;
    }
    create.mutate({
      categoryId,
      amount: parsed,
      currency,
      expenseDate,
      description: description || undefined,
      paidTo: paidTo || undefined,
      accountId: accountId === "auto" ? undefined : accountId,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Xarajat qo'shish
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Xarajat qo'shish</DialogTitle>
            <DialogDescription>
              Yangi operatsion xarajatni qayd eting.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="category">Kategoriya</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Kategoriyani tanlang" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name ?? "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="amount">Summa</Label>
                <Input
                  id="amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="currency">Valyuta</Label>
                <Select
                  value={currency}
                  onValueChange={(v) => setCurrency(v as "USD" | "UZS")}
                >
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="UZS">UZS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="account">Qaysi hisobdan (kassa)</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Avtomatik (valyuta bo'yicha)</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="expenseDate">Sana</Label>
              <Input
                id="expenseDate"
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Tavsif</Label>
              <Input
                id="description"
                placeholder="Ixtiyoriy"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="paidTo">Kimga to'landi</Label>
              <Input
                id="paidTo"
                placeholder="Ixtiyoriy"
                value={paidTo}
                onChange={(e) => setPaidTo(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Bekor qilish
              </Button>
            </DialogClose>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Saqlanmoqda..." : "Saqlash"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
