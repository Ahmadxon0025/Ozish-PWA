"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
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
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { initials } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/constants";
import type { UserRole } from "@/types/database";
import { toast } from "@/hooks/use-toast";

export default function ProfilePage() {
  const utils = api.useUtils();
  const me = api.users.me.useQuery();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    if (me.data) {
      setFullName(me.data.full_name ?? "");
      setPhone(me.data.phone ?? "");
      setTelegramId(me.data.telegram_id ?? "");
      setAvatarUrl(me.data.avatar_url ?? "");
    }
  }, [me.data]);

  const update = api.users.updateProfile.useMutation({
    onSuccess: () => {
      void utils.users.me.invalidate();
      toast({
        title: "Profil yangilandi",
        description: "Ma'lumotlaringiz muvaffaqiyatli saqlandi.",
        variant: "success",
      });
    },
    onError: (err) => {
      toast({
        title: "Xatolik",
        description: err.message || "Profilni saqlab bo'lmadi.",
        variant: "destructive",
      });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    update.mutate({
      fullName: fullName || undefined,
      phone: phone || undefined,
      telegramId: telegramId || undefined,
      avatarUrl: avatarUrl || undefined,
    });
  }

  return (
    <div>
      <PageHeader
        title="Mening profilim"
        description="Shaxsiy ma'lumotlaringizni ko'ring va tahrirlang."
      />

      {me.isLoading ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <Skeleton className="h-5 w-32" />
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-11 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Profil ma'lumotlari</CardTitle>
            <CardDescription>
              Bu ma'lumotlar tizim bo'ylab ko'rsatiladi.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-6 flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={avatarUrl || undefined} alt={fullName} />
                <AvatarFallback className="text-lg">
                  {initials(fullName || me.data?.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {me.data?.full_name || "—"}
                </p>
                <div className="mt-1">
                  <Badge variant="secondary">
                    {me.data?.role
                      ? ROLE_LABELS[me.data.role as UserRole] ?? me.data.role
                      : "—"}
                  </Badge>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={me.data?.email ?? ""}
                  disabled
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fullName">To'liq ism</Label>
                <Input
                  id="fullName"
                  placeholder="Ism familiya"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefon</Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  placeholder="+998 90 123 45 67"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="telegramId">Telegram ID</Label>
                <Input
                  id="telegramId"
                  placeholder="Telegram chat ID yoki username"
                  value={telegramId}
                  onChange={(e) => setTelegramId(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="avatarUrl">Avatar URL</Label>
                <Input
                  id="avatarUrl"
                  type="url"
                  inputMode="url"
                  placeholder="https://..."
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={update.isPending}>
                  {update.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Saqlash
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
