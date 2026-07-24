import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { QuickAdd } from "@/components/layout/quick-add";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionUser } from "@/components/layout/user-menu";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const appUser = session.appUser;

  // Signed in but not yet provisioned / activated by a super admin.
  if (!appUser || !appUser.role || appUser.is_active === false) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Hisob faollashtirilmagan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Salom! Hisobingiz (<b>{session.email}</b>) yaratildi, lekin hali
              rol tayinlanmagan.
            </p>
            <p>
              Super Admin sizga rol berishi kerak. Iltimos, Ahmadxon bilan
              bog'laning.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const user: SessionUser = {
    fullName: appUser.full_name,
    email: appUser.email,
    role: appUser.role,
    avatarUrl: appUser.avatar_url,
  };

  return (
    <div className="flex h-dvh">
      <Sidebar role={appUser.role} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar user={user} role={appUser.role} />
        <main className="flex-1 overflow-y-auto px-4 py-5 pb-28 lg:px-6 lg:pb-6">{children}</main>
        <BottomNav role={appUser.role} />
        <QuickAdd />
      </div>
    </div>
  );
}
