import { NextResponse } from "next/server";
import { PAYMENT_TYPES } from "@/lib/crm/constants";
import { crmAdmin } from "@/lib/crm/db";
import type { PaymentStatus, PaymentType } from "@/types/crm";

export const dynamic = "force-dynamic";

const STATUSES = new Set<PaymentStatus>(["confirmed", "refunded"]);

type PostBody = {
  student_id?: unknown;
  amount?: unknown;
  payment_type?: unknown;
  note?: unknown;
};

type PatchBody = {
  payment_id?: unknown;
  status?: unknown;
};

function asAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PostBody;
    const studentId =
      typeof body.student_id === "string" ? body.student_id.trim() : "";
    const paymentType = body.payment_type;
    const amount = asAmount(body.amount);

    if (!studentId) {
      return NextResponse.json({ error: "student_id majburiy" }, { status: 400 });
    }
    if (
      typeof paymentType !== "string" ||
      !PAYMENT_TYPES.includes(paymentType as PaymentType)
    ) {
      return NextResponse.json({ error: "payment_type noto'g'ri" }, { status: 400 });
    }
    if (amount == null || amount < 0) {
      return NextResponse.json({ error: "amount noto'g'ri" }, { status: 400 });
    }

    const db = crmAdmin();
    const { data: student, error: studentError } = await db
      .from("crm_students")
      .select("id")
      .eq("id", studentId)
      .maybeSingle();

    if (studentError) throw new Error(studentError.message);
    if (!student?.id) {
      return NextResponse.json({ error: "O'quvchi topilmadi" }, { status: 404 });
    }

    const { data: payment, error: payError } = await db
      .from("crm_payments")
      .insert({
        student_id: studentId,
        amount,
        type: paymentType,
        status: "pending",
      })
      .select("id")
      .single();

    if (payError) throw new Error(payError.message);
    const paymentId = payment?.id as string | undefined;
    if (!paymentId) throw new Error("To'lov yaratilmadi");

    return NextResponse.json({ payment_id: paymentId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Noma'lum xato";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as PatchBody;
    const paymentId =
      typeof body.payment_id === "string" ? body.payment_id.trim() : "";
    const status = body.status;

    if (!paymentId) {
      return NextResponse.json({ error: "payment_id majburiy" }, { status: 400 });
    }
    if (typeof status !== "string" || !STATUSES.has(status as PaymentStatus)) {
      return NextResponse.json({ error: "status noto'g'ri" }, { status: 400 });
    }

    const db = crmAdmin();
    const { data: current, error: fetchError } = await db
      .from("crm_payments")
      .select("id")
      .eq("id", paymentId)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!current?.id) {
      return NextResponse.json({ error: "To'lov topilmadi" }, { status: 404 });
    }

    const { error: updateError } = await db
      .from("crm_payments")
      .update({ status })
      .eq("id", paymentId);
    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Noma'lum xato";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
