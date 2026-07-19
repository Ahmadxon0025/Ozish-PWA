"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Sun,
  MessageSquare,
  Inbox as InboxIcon,
} from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDue, priorityVariant } from "@/lib/task-ui";
import { formatDateTime } from "@/lib/format";
import { TASK_PRIORITY_LABELS } from "@/lib/constants";

type InboxTask =
  inferRouterOutputs<AppRouter>["tasks"]["inbox"]["overdue"][number];

function TaskRow({ t }: { t: InboxTask }) {
  return (
    <Link href={`/tasks/${t.id}`} className="block">
      <Card className="hover:bg-muted/40">
        <CardContent className="flex items-center justify-between gap-2 p-3">
          <span className="min-w-0 truncate text-sm font-medium">{t.title}</span>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant={priorityVariant(t.priority)}>
              {TASK_PRIORITY_LABELS[t.priority] ?? t.priority}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatDue(t.due_date)}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function InboxPage() {
  const inbox = api.tasks.inbox.useQuery();

  if (inbox.isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const d = inbox.data;
  const empty =
    !d ||
    (d.overdue.length === 0 &&
      d.dueToday.length === 0 &&
      d.recentComments.length === 0);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Bildirishnomalar"
        description="Sizga tegishli muhim narsalar."
      />
      {empty || !d ? (
        <EmptyState
          icon={InboxIcon}
          title="Hammasi joyida! 🎉"
          description="Muddati o'tgan yoki bugungi vazifa, yangi izoh yo'q."
        />
      ) : (
        <div className="space-y-6">
          {d.overdue.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
                <AlertTriangle className="h-4 w-4" /> Muddati o&apos;tgan ({d.overdue.length})
              </h2>
              <div className="space-y-2">
                {d.overdue.map((t) => (
                  <TaskRow key={t.id} t={t} />
                ))}
              </div>
            </section>
          )}

          {d.dueToday.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Sun className="h-4 w-4 text-amber-500" /> Bugun ({d.dueToday.length})
              </h2>
              <div className="space-y-2">
                {d.dueToday.map((t) => (
                  <TaskRow key={t.id} t={t} />
                ))}
              </div>
            </section>
          )}

          {d.recentComments.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="h-4 w-4" /> So&apos;nggi izohlar ({d.recentComments.length})
              </h2>
              <div className="space-y-2">
                {d.recentComments.map((c) => (
                  <Link key={c.id} href={`/tasks/${c.taskId}`} className="block">
                    <Card className="hover:bg-muted/40">
                      <CardContent className="p-3">
                        <div className="text-xs text-muted-foreground">
                          <b className="text-foreground">{c.author}</b> ·{" "}
                          {c.taskTitle} · {formatDateTime(c.createdAt)}
                        </div>
                        <p className="mt-1 text-sm">{c.content}</p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
