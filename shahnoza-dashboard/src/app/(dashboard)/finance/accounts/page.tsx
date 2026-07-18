"use client";

import { useState } from "react";
import {
  Landmark,
  Wallet,
  CreditCard,
  Banknote,
  ArrowLeftRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Plus,
  Pencil,
  Trash2,
  Lock,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { formatUsd, formatNumber, formatDateTime } from "@/lib/format";

function fmtNative(amount: number, currency: string) {
  return currency === "USD"
    ? formatUsd(amount, 2)
    : `${formatNumber(Math.round(amount))} so'm`;
}

const KIND_ICON: Record<string, typeof Wallet> = {
  bank: Landmark,
  card: CreditCard,
  cash: Banknote,
  visa: CreditCard,
  other: Wallet,
};

export default function AccountsPage() {
  const utils = api.useUtils();
  const accounts = api.accounts.list.useQuery();
  const txns = api.accounts.transactions.useQuery({ limit: 50 });

  const rate = accounts.data?.rate;
  const items = accounts.data?.items ?? [];

  const invalidate = () => {
    utils.accounts.list.invalidate();
    utils.accounts.transactions.invalidate();
  };

  return (
    <div>
      <PageHeader
        title="Hisoblar (Kassa)"
        description={
          rate
            ? `CBU kursi: 1 $ = ${formatNumber(Math.round(rate.rate))} so'm${rate.source === "fallback" ? " (zaxira)" : ""}`
            : "Hisoblar va pul harakati"
        }
        actions={
          <div className="flex gap-2">
            <TransferDialog accounts={items} onDone={invalidate} />
            <AddAccountDialog onDone={invalidate} />
          </div>
        }
      />

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {accounts.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              label="Jami balans"
              value={formatUsd(accounts.data?.totalUsd ?? 0)}
              sub="Barcha hisoblar (USD)"
              icon={Wallet}
              tone="success"
            />
            {items.slice(0, 3).map((a) => (
              <KpiCard
                key={a.id}
                label={a.name}
                value={fmtNative(a.balance, a.currency)}
                sub={a.currency === "USD" ? undefined : `≈ ${formatUsd(a.balanceUsd)}`}
                icon={KIND_ICON[a.kind ?? "other"] ?? Wallet}
              />
            ))}
          </>
        )}
      </div>

      {/* Account cards with actions */}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items.map((a) => {
          const Icon = KIND_ICON[a.kind ?? "other"] ?? Wallet;
          return (
            <Card key={a.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{a.name}</span>
                      <Badge variant="secondary">{a.currency}</Badge>
                    </div>
                    <div className="text-lg font-bold">
                      {fmtNative(a.balance, a.currency)}
                    </div>
                    {a.currency !== "USD" && (
                      <div className="text-xs text-muted-foreground">
                        ≈ {formatUsd(a.balanceUsd)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <MoveDialog
                    account={a}
                    mode="deposit"
                    onDone={invalidate}
                  />
                  <MoveDialog
                    account={a}
                    mode="withdraw"
                    onDone={invalidate}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
        {!accounts.isLoading && items.length === 0 && (
          <div className="md:col-span-2">
            <EmptyState
              icon={Landmark}
              title="Hisob yo'q"
              description="Birinchi hisobingizni qo'shing."
            />
          </div>
        )}
      </div>

      {/* Transactions */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">So'nggi harakatlar</CardTitle>
        </CardHeader>
        <CardContent>
          {txns.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : txns.data && txns.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sana</TableHead>
                  <TableHead>Hisob</TableHead>
                  <TableHead>Turi</TableHead>
                  <TableHead>Izoh</TableHead>
                  <TableHead className="text-right">Summa</TableHead>
                  <TableHead className="text-right">Amal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txns.data.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(t.occurred_at)}
                    </TableCell>
                    <TableCell>{t.accountName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{t.kind}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {t.description ?? "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${t.direction === "in" ? "text-success" : "text-destructive"}`}
                    >
                      {t.direction === "in" ? "+" : "−"}
                      {fmtNative(Number(t.amount), t.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <TxnActions txn={t} onDone={invalidate} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState icon={ArrowLeftRight} title="Harakatlar yo'q" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type AccountItem = {
  id: string;
  name: string;
  currency: string;
  kind: string | null;
  balance: number;
  balanceUsd: number;
};

function TransferDialog({
  accounts,
  onDone,
}: {
  accounts: AccountItem[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");

  const from = accounts.find((a) => a.id === fromId);
  const to = accounts.find((a) => a.id === toId);
  const rateQ = api.accounts.currentRate.useQuery(undefined, { enabled: open });
  const rate = rateQ.data?.rate ?? 0;

  const amt = Number(amount) || 0;
  let converted = amt;
  if (from && to && from.currency !== to.currency && rate > 0) {
    converted =
      from.currency === "UZS" ? amt / rate : amt * rate;
  }

  const m = api.accounts.transfer.useMutation({
    onSuccess: () => {
      toast({ title: "O'tkazildi", variant: "success" });
      onDone();
      setOpen(false);
      setAmount("");
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ArrowLeftRight className="h-4 w-4" /> O'tkazish
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pul o'tkazish / konvertatsiya</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Qaysi hisobdan</Label>
            <Select value={fromId} onValueChange={setFromId}>
              <SelectTrigger>
                <SelectValue placeholder="Hisob tanlang" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Qaysi hisobga</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger>
                <SelectValue placeholder="Hisob tanlang" />
              </SelectTrigger>
              <SelectContent>
                {accounts
                  .filter((a) => a.id !== fromId)
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Summa {from ? `(${from.currency})` : ""}</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          {from && to && from.currency !== to.currency && amt > 0 && (
            <p className="rounded-md bg-muted p-2 text-sm">
              {fmtNative(amt, from.currency)} →{" "}
              <b>{fmtNative(converted, to.currency)}</b>
              <span className="text-muted-foreground">
                {" "}
                (CBU 1$={formatNumber(Math.round(rate))} so'm)
              </span>
            </p>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Bekor</Button>
          </DialogClose>
          <Button
            disabled={!fromId || !toId || amt <= 0 || m.isPending}
            onClick={() =>
              m.mutate({ fromAccountId: fromId, toAccountId: toId, amount: amt })
            }
          >
            O'tkazish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoveDialog({
  account,
  mode,
  onDone,
}: {
  account: AccountItem;
  mode: "deposit" | "withdraw";
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const deposit = api.accounts.deposit.useMutation({
    onSuccess: () => done(),
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  const withdraw = api.accounts.withdraw.useMutation({
    onSuccess: () => done(),
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  function done() {
    toast({ title: mode === "deposit" ? "Kirim qo'shildi" : "Chiqim qo'shildi", variant: "success" });
    onDone();
    setOpen(false);
    setAmount("");
    setDescription("");
  }

  const amt = Number(amount) || 0;
  const isDeposit = mode === "deposit";
  const pending = deposit.isPending || withdraw.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={isDeposit ? "outline" : "ghost"}>
          {isDeposit ? (
            <ArrowDownToLine className="h-4 w-4" />
          ) : (
            <ArrowUpFromLine className="h-4 w-4" />
          )}
          {isDeposit ? "Kirim" : "Chiqim"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isDeposit ? "Kirim" : "Chiqim"} — {account.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Summa ({account.currency})</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Izoh</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isDeposit ? "masalan: chetdan tushdi" : "masalan: naqd yechildi"}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Bekor</Button>
          </DialogClose>
          <Button
            disabled={amt <= 0 || pending}
            onClick={() => {
              const args = { accountId: account.id, amount: amt, description: description || undefined };
              if (isDeposit) deposit.mutate(args);
              else withdraw.mutate(args);
            }}
          >
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddAccountDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"bank" | "card" | "cash" | "visa" | "other">("bank");
  const [currency, setCurrency] = useState<"UZS" | "USD">("UZS");

  const m = api.accounts.createAccount.useMutation({
    onSuccess: () => {
      toast({ title: "Hisob qo'shildi", variant: "success" });
      onDone();
      setOpen(false);
      setName("");
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> Hisob
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yangi hisob</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nomi</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="masalan: Payme" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Turi</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="card">Karta</SelectItem>
                  <SelectItem value="cash">Naqd</SelectItem>
                  <SelectItem value="visa">Visa</SelectItem>
                  <SelectItem value="other">Boshqa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valyuta</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as typeof currency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UZS">so'm (UZS)</SelectItem>
                  <SelectItem value="USD">dollar (USD)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Bekor</Button>
          </DialogClose>
          <Button disabled={!name || m.isPending} onClick={() => m.mutate({ name, kind, currency })}>
            Qo'shish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Txn = {
  id: string;
  amount: number;
  currency: string;
  description: string | null;
  occurred_at: string;
  related_type: string | null;
};

const LOCKED_KINDS = ["expense", "sale", "sale_refund"];

function TxnActions({ txn, onDone }: { txn: Txn; onDone: () => void }) {
  const locked = LOCKED_KINDS.includes(txn.related_type ?? "");
  const del = api.accounts.deleteTransaction.useMutation({
    onSuccess: () => {
      toast({ title: "O'chirildi", variant: "success" });
      onDone();
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  if (locked) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
        title="Bu yozuv avtomatik — Xarajatlar/Sotuvlar sahifasida tahrirlang"
      >
        <Lock className="h-3.5 w-3.5" /> manba
      </span>
    );
  }

  return (
    <div className="flex justify-end gap-1">
      <EditTxnDialog txn={txn} onDone={onDone} />
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-destructive"
        onClick={() => {
          if (confirm("Bu harakatni o'chirasizmi?")) del.mutate({ id: txn.id });
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function EditTxnDialog({ txn, onDone }: { txn: Txn; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(txn.amount));
  const [description, setDescription] = useState(txn.description ?? "");
  const [date, setDate] = useState(txn.occurred_at.slice(0, 10));

  const m = api.accounts.updateTransaction.useMutation({
    onSuccess: () => {
      toast({ title: "Saqlandi", variant: "success" });
      onDone();
      setOpen(false);
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  const amt = Number(amount) || 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Harakatni tahrirlash</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Summa ({txn.currency})</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Izoh</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Sana</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Bekor</Button>
          </DialogClose>
          <Button
            disabled={amt <= 0 || m.isPending}
            onClick={() =>
              m.mutate({
                id: txn.id,
                amount: amt,
                description,
                occurredAt: `${date}T12:00:00Z`,
              })
            }
          >
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
