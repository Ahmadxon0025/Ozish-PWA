import { NextResponse } from "next/server";
import { createCrmLead } from "@/lib/crm/intake";
import { loadFormBySlug, mapFormAnswers } from "@/lib/crm/forms";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function corsJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

type WebhookBody = {
  slug?: unknown;
  token?: unknown;
  answers?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as WebhookBody;
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const answersRaw = body.answers;

    if (!slug || !token) {
      return corsJson({ error: "slug va token majburiy" }, 400);
    }

    const answers: Record<string, string> = {};
    if (answersRaw && typeof answersRaw === "object" && !Array.isArray(answersRaw)) {
      for (const [key, value] of Object.entries(answersRaw as Record<string, unknown>)) {
        if (value == null) continue;
        answers[key] = String(value).trim();
      }
    }

    const form = await loadFormBySlug(slug);
    if (!form || !form.is_active) {
      return corsJson({ error: "Forma topilmadi" }, 404);
    }
    if (form.webhook_token !== token) {
      return corsJson({ error: "Token noto'g'ri" }, 401);
    }

    const { draft, missing } = mapFormAnswers(form, answers);
    if (missing.length > 0) {
      return corsJson({ error: `Majburiy: ${missing.join(", ")}` }, 400);
    }
    if (!draft.ism || !draft.telefon) {
      return corsJson({ error: "ism va telefon majburiy" }, 400);
    }
    if (!draft.cohort_id) {
      return corsJson({ error: "Formada kogorta tanlanmagan" }, 400);
    }

    const result = await createCrmLead(draft);
    return corsJson({
      ok: true,
      lead_id: result.lead_id,
      existing: result.existing || undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Noma'lum xato";
    return corsJson({ error: message }, 500);
  }
}
