import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireAdminClient } from "@/lib/supabase/admin";
import { FILES_BUCKET } from "@/lib/files";
import {
  isServiceRoleConfigured,
  isTranscribeConfigured,
} from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Whisper on a long call can take ~30-60s.

/**
 * Transcribe an already-uploaded call recording. The browser uploads the audio
 * straight to Supabase Storage (bypassing the serverless body-size limit) under
 * `calls/…` in the `task-files` bucket, then POSTs `{ storagePath }` here. We
 * download it with the service role, send it to Whisper, delete the temp audio
 * (we keep only the transcript), and return the text. Any signed-in team member
 * may transcribe — same audience as the analyzer.
 */
export async function POST(request: NextRequest) {
  if (!isTranscribeConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Nutqni matnga aylantirish sozlanmagan (OPENAI_API_KEY yo'q)." },
      { status: 503 },
    );
  }
  if (!isServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  // AuthN: require a signed-in session.
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let storagePath: string | undefined;
  try {
    const body = (await request.json()) as { storagePath?: unknown };
    storagePath = typeof body.storagePath === "string" ? body.storagePath : undefined;
  } catch {
    // fall through to the validation below
  }
  // Only allow transcribing objects we uploaded for this feature.
  if (!storagePath || !storagePath.startsWith("calls/")) {
    return NextResponse.json({ ok: false, error: "bad_path" }, { status: 400 });
  }

  const db = requireAdminClient();
  try {
    const { data: blob, error: dlError } = await db.storage
      .from(FILES_BUCKET)
      .download(storagePath);
    if (dlError || !blob) {
      return NextResponse.json(
        { ok: false, error: "Audio topilmadi yoki yuklab bo'lmadi." },
        { status: 404 },
      );
    }

    const { transcribeAudio } = await import("@/lib/ai/transcribe");
    const filename = storagePath.split("/").pop() ?? "call.audio";
    const { text } = await transcribeAudio(blob, filename);
    return NextResponse.json({ ok: true, transcript: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transkripsiya xatosi.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  } finally {
    // The transcript is what we keep — drop the raw audio (best-effort).
    try {
      await db.storage.from(FILES_BUCKET).remove([storagePath]);
    } catch {
      // orphan cleanup is non-fatal
    }
  }
}
