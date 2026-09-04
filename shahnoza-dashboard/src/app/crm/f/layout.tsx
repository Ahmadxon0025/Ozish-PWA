import type { ReactNode } from "react";

export default function PublicFormLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#f4fbf5] text-zinc-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#00c31f] text-sm font-bold text-white">
            M
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Million Massaj Akademiyasi</p>
            <p className="text-xs text-zinc-500">Ro&apos;yxatdan o&apos;tish</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-8">{children}</main>
    </div>
  );
}
