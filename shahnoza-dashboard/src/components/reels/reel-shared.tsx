"use client";

import { Instagram, Send, Youtube, Facebook, Music2, Linkedin } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";

export type Reel = inferRouterOutputs<AppRouter>["reels"]["list"][number];

export const STATUS: {
  value: string;
  label: string;
  variant: "outline" | "secondary" | "warning" | "default" | "success";
}[] = [
  { value: "reja", label: "Reja", variant: "outline" },
  { value: "ssenariy", label: "Ssenariy tayyor", variant: "secondary" },
  { value: "suratga", label: "Suratga olindi", variant: "warning" },
  { value: "montaj", label: "Montajda", variant: "default" },
  { value: "chop", label: "Chop etildi", variant: "success" },
];
export const statusMeta = (s: string) => STATUS.find((x) => x.value === s) ?? STATUS[0];

/** Channels a reel can be published to (stored in reels.platforms TEXT[]). */
export const CHANNELS: { value: string; label: string; icon: typeof Instagram }[] = [
  { value: "instagram", label: "Instagram", icon: Instagram },
  { value: "telegram", label: "Telegram", icon: Send },
  { value: "youtube", label: "YouTube", icon: Youtube },
  { value: "facebook", label: "Facebook", icon: Facebook },
  { value: "tiktok", label: "TikTok", icon: Music2 },
  { value: "linkedin", label: "LinkedIn", icon: Linkedin },
];

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
