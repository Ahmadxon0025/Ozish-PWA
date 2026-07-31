"use client";

import { Instagram, Send, Youtube, Facebook, Music2, Linkedin } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";

export type Reel = inferRouterOutputs<AppRouter>["reels"]["list"][number];

export const STATUS: {
  value: string;
  label: string;
  variant: "outline" | "secondary" | "warning" | "default" | "success";
  /** ClickUp-style colored pill classes. */
  pill: string;
  dot: string;
}[] = [
  { value: "reja", label: "Reja", variant: "outline", pill: "bg-slate-500/15 text-slate-300", dot: "bg-slate-400" },
  { value: "ssenariy", label: "Ssenariy tayyor", variant: "secondary", pill: "bg-blue-500/15 text-blue-400", dot: "bg-blue-400" },
  { value: "suratga", label: "Suratga olindi", variant: "warning", pill: "bg-amber-500/15 text-amber-400", dot: "bg-amber-400" },
  { value: "montaj", label: "Montajda", variant: "default", pill: "bg-fuchsia-500/15 text-fuchsia-400", dot: "bg-fuchsia-400" },
  { value: "chop", label: "Chop etildi", variant: "success", pill: "bg-emerald-500/15 text-emerald-400", dot: "bg-emerald-400" },
];
export const statusMeta = (s: string) => STATUS.find((x) => x.value === s) ?? STATUS[0];

/** Channels a reel can be published to (stored in reels.platforms TEXT[]). */
export const CHANNELS: { value: string; label: string; icon: typeof Instagram; chip: string }[] = [
  { value: "instagram", label: "Instagram", icon: Instagram, chip: "bg-pink-500/15 text-pink-400" },
  { value: "telegram", label: "Telegram", icon: Send, chip: "bg-sky-500/15 text-sky-400" },
  { value: "youtube", label: "YouTube", icon: Youtube, chip: "bg-red-500/15 text-red-400" },
  { value: "facebook", label: "Facebook", icon: Facebook, chip: "bg-blue-500/15 text-blue-400" },
  { value: "tiktok", label: "TikTok", icon: Music2, chip: "bg-neutral-500/20 text-neutral-300" },
  { value: "linkedin", label: "LinkedIn", icon: Linkedin, chip: "bg-sky-600/15 text-sky-500" },
];
export const channelMeta = (v: string) => CHANNELS.find((c) => c.value === v);

/** Colored channel chips (ClickUp-style). */
export function ChannelChips({ platforms }: { platforms: string[] | null }) {
  const p = platforms ?? [];
  const shown = CHANNELS.filter((c) => p.includes(c.value));
  if (shown.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((c) => (
        <span
          key={c.value}
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${c.chip}`}
        >
          <c.icon className="h-3 w-3" /> {c.label}
        </span>
      ))}
    </span>
  );
}

export function ChannelIcons({ platforms }: { platforms: string[] | null }) {
  const p = platforms ?? [];
  const shown = CHANNELS.filter((c) => p.includes(c.value));
  if (shown.length === 0) return null;
  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      {shown.map((c) => (
        <c.icon key={c.value} className="h-3.5 w-3.5" />
      ))}
    </span>
  );
}
