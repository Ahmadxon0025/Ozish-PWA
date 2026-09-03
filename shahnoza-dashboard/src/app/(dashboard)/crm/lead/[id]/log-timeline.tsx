import { format, parseISO } from "date-fns";
import { Mail, MessageCircle, Pencil, Phone } from "lucide-react";
import { HARAKAT_LABELS } from "@/lib/crm/constants";
import { logIzoh, logTimestamp, type CrmLogRow } from "@/lib/crm/log";

function LogIcon({ harakat }: { harakat: string }) {
  const className = "h-3.5 w-3.5 text-muted-foreground";
  if (harakat === "qongiroq" || harakat === "call_attempt" || harakat === "call_connected") {
    return <Phone className={className} />;
  }
  if (harakat === "telegram" || harakat === "whatsapp") {
    return <MessageCircle className={className} />;
  }
  if (harakat === "email" || harakat === "sms") {
    return <Mail className={className} />;
  }
  return <Pencil className={className} />;
}

function formatLogTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd.MM HH:mm");
  } catch {
    return "—";
  }
}

export function LogTimeline({ logs }: { logs: CrmLogRow[] }) {
  if (logs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Hali aloqa yozuvi yo&apos;q.</p>
    );
  }

  return (
    <ol className="space-y-0">
      {logs.map((log) => {
        const note = logIzoh(log);
        return (
          <li
            key={log.id}
            className="relative ml-2 border-l-2 border-muted pb-5 pl-4 last:pb-0"
          >
            <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-muted-foreground" />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <LogIcon harakat={log.harakat} />
              <span>{formatLogTime(logTimestamp(log))}</span>
              <span className="font-medium text-foreground">
                {HARAKAT_LABELS[log.harakat] ?? log.harakat}
              </span>
            </div>
            {note ? <p className="mt-1 text-sm">{note}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
