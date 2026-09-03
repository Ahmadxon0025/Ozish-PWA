import { NextResponse } from "next/server";
import { PAYMENT_TYPES, TARIF_OPTIONS } from "@/lib/crm/constants";
import { convertLeadToStudent, ConvertHttpError } from "@/lib/crm/convert";
import type { PaymentType, Tarif } from "@/types/crm";

export const dynamic = "force-dynamic";

type ConvertBody = {
  tarif?: unknown;
  amount?: unknown;
  payment_type?: unknown;
};

function asAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const body = (await request.json()) as ConvertBody;
    const tarif = body.tarif;
    const paymentType = body.payment_type;
    const amount = asAmount(body.amount);

    if (typeof tarif !== "string" || !TARIF_OPTIONS.includes(tarif as Tarif)) {
      return NextResponse.json({ error: "tarif noto'g'ri" }, { status: 400 });
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

    const result = await convertLeadToStudent({
      leadId: params.id,
      tarif: tarif as Tarif,
      amount,
      paymentType: paymentType as PaymentType,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ConvertHttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Noma'lum xato";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
