"use client";

import { useState } from "react";
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ArrowUpDown,
  ShoppingCart,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { formatUsd, formatUzs, formatDate } from "@/lib/format";
import { PAYMENT_PROVIDERS } from "@/lib/constants";
import type { UserRole } from "@/types/database";
import { toast } from "@/hooks/use-toast";

const MANAGER_ROLES: UserRole[] = ["super_admin", "owner", "sales_manager"];

const ALL = "all";
const PAGE_SIZE = 25;

const PROVIDER_LABELS: Record<string, string> = {
  click: "Click",
  payme: "Payme",
  uzum_nasiya: "Uzum Nasiya",
};

type SortBy = "sold_at" | "total_amount_usd";
type SortDir = "asc" | "desc";

function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SalesListPage() {
  const [search, setSearch] = useState("");
  const [salesPersonId, setSalesPersonId] = useState<string>(ALL);
  const [onlyRefunded, setOnlyRefunded] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("sold_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  const users = api.users.list.useQuery({ activeOnly: true });
  const me = api.users.me.useQuery();
  const canManage = MANAGER_ROLES.includes((me.data?.role ?? "") as UserRole);
  const utils = api.useUtils();
  const list = api.sales.list.useQuery({
    search: search || undefined,
    salesPersonId: salesPersonId === ALL ? undefined : salesPersonId,
    onlyRefunded: onlyRefunded || undefined,
    page,
    pageSize: PAGE_SIZE,
    sortBy,
    sortDir,
  });

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function toggleSort(col: SortBy) {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title="Sotuvlar ro'yxati"
        description="Barcha bitimlarni ko'ring, filtrlang va yangi sotuv qo'shing."
        actions={<NewSaleDialog users={users.data ?? []} />}
      />

      {/* Controls */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Qidirish..."
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <Select
          value={salesPersonId}
          onValueChange={(v) => {
            setSalesPersonId(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-[200px]">
            <SelectValue placeholder="Sotuvchi" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Hammasi</SelectItem>
            {(users.data ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={onlyRefunded ? "default" : "outline"}
          onClick={() => {
            setOnlyRefunded((v) => !v);
            setPage(1);
          }}
        >
          <RotateCcw className="h-4 w-4" />
          Faqat qaytarilgan
        </Button>
      </div>

      {list.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Sotuv topilmadi"
          description="Filtrlarni o'zgartiring yoki yangi sotuv qo'shing."
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort("sold_at")}
                        className="inline-flex items-center gap-1 uppercase"
                      >
                        Sana
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead>Sotuvchi</TableHead>
                    <TableHead>Mahsulot</TableHead>
                    <TableHead className="text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort("total_amount_usd")}
                        className="inline-flex items-center gap-1 uppercase"
                      >
                        Summa
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead>Holat</TableHead>
                    <TableHead>Izoh</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(s.sold_at)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {s.salesPersonName}
                      </TableCell>
                      <TableCell>{s.productName}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatUsd(s.total_amount_usd)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {s.is_refunded ? (
                            <Badge variant="destructive">Qaytarilgan</Badge>
                          ) : (
                            <Badge variant="success">To'landi</Badge>
                          )}
                          {canManage && !s.is_refunded && (
                            <RefundDialog
                              saleId={s.id}
                              defaultUzs={Number(s.total_amount_uzs ?? 0)}
                              onDone={() => utils.sales.list.invalidate()}
                            />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">
                        {s.notes || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Mobile stacked cards */}
          <div className="space-y-3 md:hidden">
            {items.map((s) => (
              <Card key={s.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{s.salesPersonName}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {s.productName}
                      </p>
                    </div>
                    <p className="shrink-0 text-base font-semibold">
                      {formatUsd(s.total_amount_usd)}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {formatDate(s.sold_at)}
                    </span>
                    <div className="flex items-center gap-2">
                      {s.is_refunded ? (
                        <Badge variant="destructive">Qaytarilgan</Badge>
                      ) : (
                        <Badge variant="success">To'landi</Badge>
                      )}
                      {canManage && !s.is_refunded && (
                        <RefundDialog
                          saleId={s.id}
                          defaultUzs={Number(s.total_amount_uzs ?? 0)}
                          onDone={() => utils.sales.list.invalidate()}
                        />
                      )}
                    </div>
                  </div>
                  {s.notes && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {s.notes}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Jami {total} ta · {page}/{totalPages}-sahifa
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Oldingi
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Keyingi
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NewSaleDialog({
  users,
}: {
  users: Array<{ id: string; full_name: string }>;
}) {
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const [salesPersonId, setSalesPersonId] = useState<string>("");
  const [productId, setProductId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"USD" | "UZS">("USD");
  const [accountId, setAccountId] = useState<string>("");
  const [provider, setProvider] = useState<string>("");
  const [soldAt, setSoldAt] = useState<string>(todayInput());
  const [notes, setNotes] = useState("");

  const products = api.sales.products.useQuery(undefined, { enabled: open });
  const accounts = api.accounts.list.useQuery(undefined, { enabled: open });
  const rateQ = api.accounts.currentRate.useQuery(undefined, { enabled: open });
  const rate = rateQ.data?.rate ?? 12900;

  const create = api.sales.create.useMutation({
    onSuccess: () => {
      void utils.sales.list.invalidate();
      void utils.sales.overview.invalidate();
      toast({
        title: "Sotuv qo'shildi",
        description: "Yangi sotuv muvaffaqiyatli saqlandi.",
        variant: "success",
      });
      resetForm();
      setOpen(false);
    },
    onError: (err) => {
      toast({
        title: "Xatolik",
        description: err.message || "Sotuvni saqlab bo'lmadi.",
        variant: "destructive",
      });
    },
  });

  function resetForm() {
    setSalesPersonId("");
    setProductId("");
    setAmount("");
    setCurrency("USD");
    setAccountId("");
    setProvider("");
    setSoldAt(todayInput());
    setNotes("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const entered = Number(amount);
    if (!entered || entered <= 0) {
      toast({
        title: "Summani kiriting",
        description: "Summa 0 dan katta bo'lishi kerak.",
        variant: "destructive",
      });
      return;
    }
    const totalUsd = currency === "USD" ? entered : Math.round((entered / rate) * 100) / 100;
    const totalUzs = currency === "UZS" ? entered : Math.round(entered * rate);
    create.mutate({
      salesPersonId: salesPersonId || undefined,
      productId: productId || undefined,
      accountId: accountId || undefined,
      totalAmountUsd: totalUsd,
      totalAmountUzs: totalUzs,
      paymentProvider: provider
        ? (provider as (typeof PAYMENT_PROVIDERS)[number])
        : undefined,
      soldAt: new Date(soldAt).toISOString(),
      notes: notes || undefined,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Yangi sotuv
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yangi sotuv</DialogTitle>
          <DialogDescription>
            Sotuv ma'lumotlarini kiriting va saqlang.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="product">Mahsulot</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger id="product">
                <SelectValue placeholder="Mahsulotni tanlang" />
              </SelectTrigger>
              <SelectContent>
                {(products.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} (${Number(p.price_usd ?? 0)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="salesperson">Sotuvchi</Label>
            <Select value={salesPersonId} onValueChange={setSalesPersonId}>
              <SelectTrigger id="salesperson">
                <SelectValue placeholder="Sotuvchini tanlang" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
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
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currency">Valyuta</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as "USD" | "UZS")}>
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

          <div className="space-y-1.5">
            <Label htmlFor="account">Qaysi hisobga</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="account">
                <SelectValue placeholder="Hisob (avtomatik: so'm)" />
              </SelectTrigger>
              <SelectContent>
                {(accounts.data?.items ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="provider">To'lov provayderi</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger id="provider">
                <SelectValue placeholder="Provayderni tanlang" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PROVIDER_LABELS[p] ?? p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="soldAt">Sotuv sanasi</Label>
            <Input
              id="soldAt"
              type="date"
              value={soldAt}
              onChange={(e) => setSoldAt(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Izoh</Label>
            <Input
              id="notes"
              placeholder="Ixtiyoriy izoh"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Bekor qilish
              </Button>
            </DialogClose>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Saqlash
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({
  saleId,
  defaultUzs,
  onDone,
}: {
  saleId: string;
  defaultUzs: number;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(defaultUzs ? String(defaultUzs) : "");
  const [reason, setReason] = useState("");
  const refund = api.sales.refund.useMutation({
    onSuccess: () => {
      toast({ title: "Qaytarildi", variant: "success" });
      setOpen(false);
      onDone();
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  const amt = Number(amount) || 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-destructive">
          <RotateCcw className="h-3.5 w-3.5" /> Qaytarish
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sotuvni qaytarish (refund)</DialogTitle>
          <DialogDescription>
            Qaytarilgan summa hisobdan chiqadi va P&amp;L&apos;da o&apos;sha oyda tan olinadi.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Qaytariladigan summa (so&apos;m)</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={defaultUzs ? formatUzs(defaultUzs) : "0"}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Sabab</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="masalan: mijoz voz kechdi" />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Bekor</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={amt <= 0 || refund.isPending}
            onClick={() =>
              refund.mutate({ saleId, refundAmountUzs: amt, reason: reason || undefined })
            }
          >
            Qaytarish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
