import type { ReactNode } from "react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { CheckSquare, Mail, MessageCircle, Pencil, Phone, RefreshCw } from "lucide-react";
import { HARAKAT_LABELS } from "@/lib/crm/constants";
import { logIzoh, logTimestamp, type CrmLogRow } from "@/lib/crm/log";
import { cn } from "@/lib/utils";

function isStageChange(harakat: string): boolean {
  return harakat === "bosqich_ozgardi" || harakat === "stage_change";
}

function iconWrap(className: string, child: ReactNode) {
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white",
        className,
      )}
    >
      {child}
    </span>
  );
}

function LogIcon({ harakat }: { harakat: string }) {
  const i = "h-3.5 w-3.5";
  if (harakat === "qongiroq" || harakat === "call_attempt" || harakat === "call_connected") {
    return iconWrap("bg-emerald-600", <Phone className={i} />);
  }
  if (harakat === "vazifa") {
    return iconWrap("bg-amber-500", <CheckSquare className={i} />);
  }
  if (harakat === "telegram" || harakat === "whatsapp") {
    return iconWrap("bg-sky-600", <MessageCircle className={i} />);
  }
  if (harakat === "email" || harakat === "sms") {
    return iconWrap("bg-violet-600", <Mail className={i} />);
  }
  if (isStageChange(harakat)) {
    return iconWrap("bg-zinc-500", <RefreshCw className={i} />);
  }
  return iconWrap("bg-blue-600", <Pencil className={i} />);
}

function formatLogTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const date = parseISO(iso);
    const relative = formatDistanceToNow(date, { addSuffix: true });
    const stamp = format(date, "dd.MM HH:mm");
    return `${relative} · ${stamp}`;
  } catch {
    return "—";
  }
}

function authorLabel(kim: string | null): string {
  if (!kim?.trim()) return "tizim";
  if (kim.length > 24) return "tizim";
  return kim;
}

export function LogTimeline({ logs }: { logs: CrmLogRow[] }) {
  if (logs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Hali faoliyat yo&apos;q.</p>
    );
  }

  return (
    <ol className="space-y-2">
      {logs.map((log) => {
        const note = logIzoh(log);
        const when = formatLogTime(logTimestamp(log));
        if (isStageChange(log.harakat)) {
          return (
            <li
              key={log.id}
              className="rounded-md border border-dashed bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground"
            >
              <span className="font-medium text-foreground">Bosqich:</span>{" "}
              {note ?? (HARAKAT_LABELS[log.harakat] ?? log.harakat)}
              <span className="ml-2">{when}</span>
            </li>
          );
        }
        return (
          <li key={log.id} className="rounded-lg border bg-card p-3 shadow-sm">
            <div className="flex items-start gap-2.5">
              <LogIcon harakat={log.harakat} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium">
                    {HARAKAT_LABELS[log.harakat] ?? log.harakat}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {authorLabel(log.kim)}
                  </span>
                  <span className="text-xs text-muted-foreground">{when}</span>
                </div>
                {note ? <p className="mt-1 text-sm leading-snug">{note}</p> : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
