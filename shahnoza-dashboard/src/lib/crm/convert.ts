import type { PaymentType, Tarif } from "@/types/crm";
import { crmAdmin } from "./db";
import { insertCrmLog } from "./log";

export class ConvertHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type ConvertOk =
  | { existing: true; student_id: string }
  | { student_id: string; payment_id: string };

export async function convertLeadToStudent(input: {
  leadId: string;
  tarif: Tarif;
  amount: number;
  paymentType: PaymentType;
}): Promise<ConvertOk> {
  const db = crmAdmin();

  const { data: lead, error: leadError } = await db
    .from("crm_leads")
    .select("id, ism, bosqich, tarif")
    .eq("id", input.leadId)
    .maybeSingle();

  if (leadError) throw new Error(leadError.message);
  if (!lead?.id) {
    throw new ConvertHttpError("Lead topilmadi", 404);
  }
  if (lead.bosqich !== "yutuq") {
    throw new ConvertHttpError("Lead hali yopilmagan", 400);
  }

  const { data: existingRows, error: existError } = await db
    .from("crm_students")
    .select("id")
    .eq("lead_id", input.leadId)
    .limit(1);

  if (existError) throw new Error(existError.message);
  const existingId = (existingRows?.[0] as { id?: string } | undefined)?.id;
  if (existingId) {
    return { existing: true, student_id: existingId };
  }

  const { data: payment, error: payError } = await db
    .from("crm_payments")
    .insert({
      lead_id: input.leadId,
      amount: input.amount,
      type: input.paymentType,
      status: "pending",
    })
    .select("id")
    .single();

  if (payError) throw new Error(payError.message);
  const paymentId = payment?.id as string | undefined;
  if (!paymentId) throw new Error("To'lov yaratilmadi");

  const { data: student, error: stuError } = await db
    .from("crm_students")
    .insert({
      lead_id: input.leadId,
      ism: lead.ism,
      stage: "yangi_oquvchi",
      payment_id: paymentId,
    })
    .select("id")
    .single();

  if (stuError) throw new Error(stuError.message);
  const studentId = student?.id as string | undefined;
  if (!studentId) throw new Error("O'quvchi yaratilmadi");

  const { error: linkError } = await db
    .from("crm_payments")
    .update({ student_id: studentId })
    .eq("id", paymentId);
  if (linkError) throw new Error(linkError.message);

  await insertCrmLog({
    lead_id: input.leadId,
    harakat: "shartnoma",
    izoh: "Oquvchi yaratildi",
    kim: null,
  });

  return { student_id: studentId, payment_id: paymentId };
}
