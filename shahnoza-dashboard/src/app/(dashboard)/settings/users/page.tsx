"use client";

import { useState } from "react";
import { Plus, Loader2, ShieldAlert, Users, Wallet } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
import { formatDate, formatUsd, formatPercent, initials } from "@/lib/format";
import { ROLE_LABELS, ROLES } from "@/lib/constants";
import type { UserRole } from "@/types/database";
import { toast } from "@/hooks/use-toast";

type UserItem = {
  id: string;
  email: string;
  full_name: string;
  role: string | null;
  phone: string | null;
  telegram_id: string | null;
  avatar_url: string | null;
  is_active: boolean;
  amocrm_user_id: number | string | null;
  created_at: string;
};

function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function UsersPage() {
  const me = api.users.me.useQuery();
  const list = api.users.list.useQuery({});

  if (me.isLoading) {
    return (
      <div>
        <PageHeader title="Foydalanuvchilar" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (me.data?.role !== "super_admin") {
    return (
      <div>
        <PageHeader title="Foydalanuvchilar" />
        <EmptyState
          icon={ShieldAlert}
          title="Ruxsat yo'q"
          description="Bu bo'lim faqat Super Admin uchun."
        />
      </div>
    );
  }

  const users = (list.data ?? []) as UserItem[];

  return (
    <div>
      <PageHeader
        title="Foydalanuvchilar"
        description="Jamoa a'zolarini boshqaring, rollarni va kompensatsiyani sozlang."
        actions={<AddUserDialog />}
      />

      {list.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Foydalanuvchi topilmadi"
          description="Yangi foydalanuvchi qo'shing."
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ism</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Holat</TableHead>
                    <TableHead>amoCRM</TableHead>
                    <TableHead className="text-right">Amallar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage
                              src={u.avatar_url || undefined}
                              alt={u.full_name}
                            />
                            <AvatarFallback>
                              {initials(u.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{u.full_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.email}
                      </TableCell>
                      <TableCell>
                        <RoleSelect user={u} />
                      </TableCell>
                      <TableCell>
                        <StatusToggle user={u} />
                      </TableCell>
                      <TableCell>
                        {u.amocrm_user_id ? (
                          <span className="text-success">✓</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <CompensationDialog user={u} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Mobile stacked cards */}
          <div className="space-y-3 md:hidden">
            {users.map((u) => (
              <Card key={u.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage
                        src={u.avatar_url || undefined}
                        alt={u.full_name}
                      />
                      <AvatarFallback>{initials(u.full_name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{u.full_name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {u.email}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Rol
                      </Label>
                      <RoleSelect user={u} />
                    </div>
                    <div className="flex items-center justify-between">
                      <StatusToggle user={u} />
                      <span className="text-sm text-muted-foreground">
                        amoCRM:{" "}
                        {u.amocrm_user_id ? (
                          <span className="text-success">✓</span>
                        ) : (
                          "—"
                        )}
                      </span>
                    </div>
                    <CompensationDialog user={u} fullWidth />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RoleSelect({ user }: { user: UserItem }) {
  const utils = api.useUtils();
  const update = api.users.update.useMutation({
    onSuccess: () => {
      void utils.users.list.invalidate();
      toast({ title: "Rol yangilandi", variant: "success" });
    },
    onError: (err) => {
      toast({
        title: "Xatolik",
        description: err.message || "Rolni o'zgartirib bo'lmadi.",
        variant: "destructive",
      });
    },
  });

  return (
    <Select
      value={user.role ?? ""}
      disabled={update.isPending}
      onValueChange={(v) =>
        update.mutate({ id: user.id, role: v as UserRole })
      }
    >
      <SelectTrigger className="h-9 w-[180px]">
        <SelectValue placeholder="Rol tanlang" />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {ROLE_LABELS[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StatusToggle({ user }: { user: UserItem }) {
  const utils = api.useUtils();
  const update = api.users.update.useMutation({
    onSuccess: () => {
      void utils.users.list.invalidate();
      toast({ title: "Holat yangilandi", variant: "success" });
    },
    onError: (err) => {
      toast({
        title: "Xatolik",
        description: err.message || "Holatni o'zgartirib bo'lmadi.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="flex items-center gap-2">
      {user.is_active ? (
        <Badge variant="success">Faol</Badge>
      ) : (
        <Badge variant="secondary">Nofaol</Badge>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={update.isPending}
        onClick={() =>
          update.mutate({ id: user.id, isActive: !user.is_active })
        }
      >
        {update.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
        {user.is_active ? "O'chirish" : "Faollashtirish"}
      </Button>
    </div>
  );
}

function AddUserDialog() {
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<string>("");
  const [phone, setPhone] = useState("");
  const [telegramId, setTelegramId] = useState("");

  function resetForm() {
    setEmail("");
    setFullName("");
    setRole("");
    setPhone("");
    setTelegramId("");
  }

  const create = api.users.create.useMutation({
    onSuccess: () => {
      void utils.users.list.invalidate();
      toast({
        title: "Foydalanuvchi qo'shildi",
        description: "Yangi foydalanuvchi muvaffaqiyatli yaratildi.",
        variant: "success",
      });
      resetForm();
      setOpen(false);
    },
    onError: (err) => {
      toast({
        title: "Xatolik",
        description: err.message || "Foydalanuvchini yaratib bo'lmadi.",
        variant: "destructive",
      });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !fullName || !role) {
      toast({
        title: "Ma'lumot yetarli emas",
        description: "Email, ism va rolni to'ldiring.",
        variant: "destructive",
      });
      return;
    }
    create.mutate({
      email,
      fullName,
      role: role as UserRole,
      phone: phone || undefined,
      telegramId: telegramId || undefined,
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
          Foydalanuvchi qo'shish
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yangi foydalanuvchi</DialogTitle>
          <DialogDescription>
            Foydalanuvchi ma'lumotlarini kiriting.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-email">Email</Label>
            <Input
              id="new-email"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-name">To'liq ism</Label>
            <Input
              id="new-name"
              placeholder="Ism familiya"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-role">Rol</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="new-role">
                <SelectValue placeholder="Rol tanlang" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-phone">Telefon</Label>
            <Input
              id="new-phone"
              type="tel"
              placeholder="+998 90 123 45 67"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-telegram">Telegram ID</Label>
            <Input
              id="new-telegram"
              placeholder="Telegram chat ID"
              value={telegramId}
              onChange={(e) => setTelegramId(e.target.value)}
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
              Yaratish
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CompensationDialog({
  user,
  fullWidth,
}: {
  user: UserItem;
  fullWidth?: boolean;
}) {
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);

  const [baseSalary, setBaseSalary] = useState("");
  const [commissionRate, setCommissionRate] = useState("");
  const [bonusRate, setBonusRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(todayInput());

  const comp = api.users.compensation.useQuery(
    { userId: user.id },
    { enabled: open },
  );

  function resetForm() {
    setBaseSalary("");
    setCommissionRate("");
    setBonusRate("");
    setEffectiveFrom(todayInput());
  }

  const setComp = api.users.setCompensation.useMutation({
    onSuccess: () => {
      void utils.users.compensation.invalidate({ userId: user.id });
      toast({
        title: "Kompensatsiya saqlandi",
        variant: "success",
      });
      resetForm();
    },
    onError: (err) => {
      toast({
        title: "Xatolik",
        description: err.message || "Kompensatsiyani saqlab bo'lmadi.",
        variant: "destructive",
      });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveFrom) {
      toast({
        title: "Sana kiriting",
        description: "Amal qilish sanasini tanlang.",
        variant: "destructive",
      });
      return;
    }
    setComp.mutate({
      userId: user.id,
      baseSalaryUsd: baseSalary ? Number(baseSalary) : undefined,
      commissionRate: commissionRate ? Number(commissionRate) : undefined,
      bonusRate: bonusRate ? Number(bonusRate) : undefined,
      effectiveFrom,
    });
  }

  const records = comp.data ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={fullWidth ? "w-full" : undefined}
        >
          <Wallet className="h-4 w-4" />
          Kompensatsiya
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kompensatsiya · {user.full_name}</DialogTitle>
          <DialogDescription>
            Oylik, ustama va bonus stavkalari tarixi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm font-medium">Joriy va o'tmish yozuvlari</p>
          {comp.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : records.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Hali kompensatsiya yozuvi yo'q.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Oylik</TableHead>
                    <TableHead>Ustama</TableHead>
                    <TableHead>Bonus</TableHead>
                    <TableHead>Sanadan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatUsd(r.base_salary_usd)}</TableCell>
                      <TableCell>{formatPercent(r.commission_rate, 1)}</TableCell>
                      <TableCell>{formatPercent(r.bonus_rate, 1)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(r.effective_from)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <Separator className="my-2" />

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm font-medium">Yangi yozuv qo'shish</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`base-${user.id}`}>Oylik (USD)</Label>
              <Input
                id={`base-${user.id}`}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0"
                value={baseSalary}
                onChange={(e) => setBaseSalary(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`comm-${user.id}`}>Ustama (masalan 0.12)</Label>
              <Input
                id={`comm-${user.id}`}
                type="number"
                inputMode="decimal"
                min="0"
                max="1"
                step="0.01"
                placeholder="0.12"
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`bonus-${user.id}`}>Bonus (masalan 0.05)</Label>
              <Input
                id={`bonus-${user.id}`}
                type="number"
                inputMode="decimal"
                min="0"
                max="1"
                step="0.01"
                placeholder="0"
                value={bonusRate}
                onChange={(e) => setBonusRate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`eff-${user.id}`}>Amal qilish sanasi</Label>
              <Input
                id={`eff-${user.id}`}
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                required
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Yopish
              </Button>
            </DialogClose>
            <Button type="submit" disabled={setComp.isPending}>
              {setComp.isPending && (
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
