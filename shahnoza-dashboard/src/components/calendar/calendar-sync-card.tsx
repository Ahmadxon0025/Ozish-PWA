"use client";

import { useState } from "react";
import { CalendarDays, Copy, Check } from "lucide-react";
import { api } from "@/lib/trpc/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";

/**
 * Shows the user's private task-calendar subscription URL and how to add it to
 * Google Calendar and iPhone. Read-only feed — tasks show up as events; the
 * calendar can't edit them back.
 */
export function CalendarSyncCard() {
  const feed = api.users.calendarFeedUrl.useQuery();
  const url = feed.data?.url ?? "";
  const [copied, setCopied] = useState(false);
  // webcal:// makes Apple/iPhone Calendar open the "Subscribe" sheet directly.
  const webcal = url.replace(/^https?:\/\//, "webcal://");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: "Havola nusxalandi", variant: "success" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Nusxalab bo'lmadi", variant: "destructive" });
    }
  };

  return (
    <Card className="mt-4 max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" /> Kalendarga ulash
        </CardTitle>
        <CardDescription>
          Vazifalaringiz (muddati bor bo&apos;lganlari) Google va iPhone
          kalendarida avtomatik ko&apos;rinadi. Bu shaxsiy havola — boshqalarga
          bermang. Kalendar faqat o&apos;qiydi, o&apos;zgartira olmaydi.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {feed.isLoading ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          <div className="flex gap-2">
            <Input readOnly value={url} className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={copy} title="Nusxalash">
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="default" size="sm" disabled={!url}>
            <a href={webcal || undefined}>iPhone / Apple kalendariga qo&apos;shish</a>
          </Button>
          <Button asChild variant="outline" size="sm" disabled={!url}>
            <a
              href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Calendar (URL orqali)
            </a>
          </Button>
        </div>

        <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">Qo&apos;shish yo&apos;riqnomasi:</p>
          <p>
            <span className="font-medium text-foreground">iPhone:</span> yuqoridagi
            ko&apos;k tugmani bosing — Kalendar &quot;Obuna bo&apos;lish&quot;
            oynasini ochadi. Yoki: Sozlamalar → Kalendar → Hisoblar → Hisob
            qo&apos;shish → Boshqa → Obuna kalendari → havolani joylang.
          </p>
          <p className="mt-1">
            <span className="font-medium text-foreground">Google:</span> havolani
            nusxalang → &quot;Google Calendar (URL orqali)&quot; ni oching →
            havolani joylang → &quot;Kalendar qo&apos;shish&quot;. Yangi vazifalar
            bir necha soatda ko&apos;rinadi (Google o&apos;zi yangilaydi).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
