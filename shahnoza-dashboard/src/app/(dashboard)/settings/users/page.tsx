"use client";

import { useState } from "react";
import {
  Plus,
  Loader2,
  ShieldAlert,
  Users,
  Wallet,
  Link2,
  Copy,
  Trash2,
  KeyRound,
} from "lucide-react";
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
  space_id: string | null;
  created_at: string;
};

const NO_SPACE = "none";

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
                    <TableHead>Bo&apos;lim</TableHead>
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
                        <SpaceSelect user={u} />
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
                        <div className="flex items-center justify-end gap-2">
                          <SetPasswordButton user={u} />
                          <LoginLinkButton user={u} />
                          <CompensationDialog user={u} />
                          <DeleteUserButton user={u} />
                        </div>
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
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Bo&apos;lim
                      </Label>
                      <SpaceSelect user={u} />
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
                    <SetPasswordButton user={u} fullWidth />
                    <LoginLinkButton user={u} fullWidth />
                    <CompensationDialog user={u} fullWidth />
                    <div className="flex justify-end">
                      <DeleteUserButton user={u} />
                    </div>
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

/** Generate a no-email login link the owner shares (e.g. via Telegram). */
function LoginLinkButton({
  user,
  fullWidth,
}: {
  user: UserItem;
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const gen = api.users.loginLink.useMutation({
    onSuccess: (r) => {
      setLink(r.link);
      setOpen(true);
    },
    onError: (e) =>
      toast({ title: "Xatolik", description: e.message, variant: "destructive" }),
  });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Nusxalandi", variant: "success" });
    } catch {
      /* clipboard may be blocked; the field is selectable as a fallback */
    }
  };
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={fullWidth ? "w-full" : ""}
        disabled={gen.isPending}
        onClick={() =>
          gen.mutate({
            userId: user.id,
            redirectTo: `${window.location.origin}/auth/callback`,
          })
        }
      >
        {gen.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Link2 className="h-4 w-4" />
        )}
        Kirish havolasi
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kirish havolasi — {user.full_name}</DialogTitle>
            <DialogDescription>
              Bu havolani <b>{user.email}</b> egasiga (masalan Telegram orqali)
              yuboring. U bosgach, tizimga kiradi. Havola bir martalik va
              vaqtinchalik — email kerak emas.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button type="button" onClick={copy}>
              <Copy className="h-4 w-4" /> Nusxa
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Set (or reset) a user's password so they log in with email + password. */
function SetPasswordButton({
  user,
  fullWidth,
}: {
  user: UserItem;
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const setPass = api.users.setPassword.useMutation({
    onSuccess: () => {
      toast({ title: "Parol o'rnatildi", variant: "success" });
      setOpen(false);
      setPw("");
    },
    onError: (e) =>
      toast({ title: "Xatolik", description: e.message, variant: "destructive" }),
  });
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={fullWidth ? "w-full" : ""}
        onClick={() => setOpen(true)}
      >
        <KeyRound className="h-4 w-4" /> Parol
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Parol o&apos;rnatish — {user.full_name}</DialogTitle>
            <DialogDescription>
              Yangi parol kiriting va uni <b>{user.email}</b> egasiga bering. U
              email + parol bilan kiradi (email kerak emas).
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              type="text"
              autoComplete="new-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Kamida 6 belgi"
            />
            <Button
              disabled={pw.trim().length < 6 || setPass.isPending}
              onClick={() => setPass.mutate({ userId: user.id, password: pw.trim() })}
            >
              Saqlash
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
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

/** Assign a person to a bo'lim (department). Non-managers only see their own
 *  bo'lim's tasks; managers/owner still see everything. */
function SpaceSelect({ user }: { user: UserItem }) {
  const utils = api.useUtils();
  const spaces = api.tasks.spaces.useQuery();
  const update = api.users.update.useMutation({
    onSuccess: () => {
      void utils.users.list.invalidate();
      toast({ title: "Bo'lim yangilandi", variant: "success" });
    },
    onError: (err) =>
      toast({ title: "Xatolik", description: err.message, variant: "destructive" }),
  });

  return (
    <Select
      value={user.space_id ?? NO_SPACE}
      disabled={update.isPending}
      onValueChange={(v) =>
        update.mutate({ id: user.id, spaceId: v === NO_SPACE ? null : v })
      }
    >
      <SelectTrigger className="h-9 w-[160px]">
        <SelectValue placeholder="Bo'lim" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_SPACE}>Bo&apos;limsiz</SelectItem>
        {(spaces.data ?? []).map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
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
        {user.is_active ? "Nofaol qilish" : "Faollashtirish"}
      </Button>
    </div>
  );
}

/** Permanently remove a user. Blocked by the DB if they have real records
 *  (sales/tasks/expenses) — deactivate those instead. */
function DeleteUserButton({ user }: { user: UserItem }) {
  const utils = api.useUtils();
  const me = api.users.me.useQuery();
  const del = api.users.delete.useMutation({
    onSuccess: () => {
      void utils.users.list.invalidate();
      toast({ title: "Foydalanuvchi o'chirildi", variant: "success" });
    },
    onError: (e) =>
      toast({ title: "Xatolik", description: e.message, variant: "destructive" }),
  });
  if (me.data?.id === user.id) return null; // can't delete yourself
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 text-destructive"
      disabled={del.isPending}
      title="Butunlay o'chirish"
      onClick={() => {
        if (window.confirm(`"${user.full_name}" butunlay o'chirilsinmi?`))
          del.mutate({ id: user.id });
      }}
    >
      {del.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
    </Button>
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
  const [password, setPassword] = useState("");
  const [spaceId, setSpaceId] = useState<string>(NO_SPACE);
  const spaces = api.tasks.spaces.useQuery(undefined, { enabled: open });

  function resetForm() {
    setEmail("");
    setFullName("");
    setRole("");
    setPhone("");
    setTelegramId("");
    setPassword("");
    setSpaceId(NO_SPACE);
  }

  const setPass = api.users.setPassword.useMutation();
  const create = api.users.create.useMutation({
    onSuccess: async (data) => {
      if (password.trim().length >= 6) {
        try {
          await setPass.mutateAsync({ userId: data.id, password: password.trim() });
        } catch {
          toast({
            title: "Foydalanuvchi qo'shildi, lekin parol o'rnatilmadi",
            variant: "destructive",
          });
        }
      }
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
    if (!fullName || !role) {
      toast({
        title: "Ma'lumot yetarli emas",
        description: "Ism va rolni to'ldiring.",
        variant: "destructive",
      });
      return;
    }
    if (!email && !phone) {
      toast({
        title: "Ma'lumot yetarli emas",
        description: "Kamida email yoki telefon raqamni kiriting.",
        variant: "destructive",
      });
      return;
    }
    create.mutate({
      email: email || undefined,
      fullName,
      role: role as UserRole,
      phone: phone || undefined,
      telegramId: telegramId || undefined,
      spaceId: spaceId === NO_SPACE ? null : spaceId,
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
            <Label htmlFor="new-email">Email yoki telefon raqam</Label>
            <Input
              id="new-email"
              type="text"
              placeholder="user@example.com yoki 901234567"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Kamita email yoki telefon raqamni kiriting.
            </p>
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
            <Label htmlFor="new-space">Bo&apos;lim</Label>
            <Select value={spaceId} onValueChange={setSpaceId}>
              <SelectTrigger id="new-space">
                <SelectValue placeholder="Bo'lim (ixtiyoriy)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SPACE}>Bo&apos;limsiz</SelectItem>
                {(spaces.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Bo&apos;lim tanlansa, foydalanuvchi faqat o&apos;sha bo&apos;lim
              vazifalarini ko&apos;radi (menejer/egadan tashqari).
            </p>
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

          <div className="space-y-1.5">
            <Label htmlFor="new-password">Parol (ixtiyoriy)</Label>
            <Input
              id="new-password"
              type="text"
              autoComplete="new-password"
              placeholder="Kamida 6 belgi — foydalanuvchiga bering"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Parol qo&apos;ysangiz, foydalanuvchi email + parol bilan kiradi.
            </p>
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
