import { CrmNav } from "./crm-nav";

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  // Auth: existing middleware already requires login for /crm/*.
  // TODO(Day 3+): closer-role guard on top of session.
  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="flex w-52 shrink-0 flex-col border-r bg-card">
        <div className="border-b px-4 py-4">
          <div className="text-sm font-semibold">Million Massaj</div>
          <div className="text-xs text-muted-foreground">Akademiyasi CRM</div>
        </div>
        <CrmNav />
      </aside>
      <main className="min-w-0 flex-1 overflow-x-hidden p-6">{children}</main>
    </div>
  );
}
