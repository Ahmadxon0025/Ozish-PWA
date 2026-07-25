import { NextResponse } from "next/server";
import { getTeamTasks, formatTeamTasksMessage } from "@/lib/telegram/operational-manager";
import { sendMessage } from "@/lib/telegram/bot";
import { requireAdminClient } from "@/lib/supabase/admin";

/** Send team task briefing to operations group. Cron endpoint (daily 08:00 and 18:00). */
export async function POST(req: Request) {
  try {
    // Auth: CRON_SECRET
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    // Fetch team tasks
    const teamTasks = await getTeamTasks();
    const message = formatTeamTasksMessage(teamTasks);

    // Send to operations/tasks group
    const admin = requireAdminClient();
    const { data: config } = (await admin
      .from("config")
      .select("*")
      .eq("key", "telegram_operations_chat_id")
      .maybeSingle()) as { data: { value: string } | null };

    const chatId = config?.value as string;
    if (!chatId) {
      return NextResponse.json(
        { message: "No operations chat configured" },
        { status: 400 }
      );
    }

    await sendMessage(chatId, message);

    return NextResponse.json({
      ok: true,
      message: "Team briefing sent",
      teamCount: teamTasks.length,
    });
  } catch (err) {
    console.error("Operational manager error:", err);
    return NextResponse.json(
      {
        message: err instanceof Error ? err.message : "Server error",
      },
      { status: 500 }
    );
  }
}
