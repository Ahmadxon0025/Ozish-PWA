import type { LeadStage, PaymentStatus, PaymentType, StudentStage, Tarif } from "@/types/crm";

export const PIPELINE_STAGES: LeadStage[] = [
  "yangi_lead",
  "aloqa_kutilmoqda",
  "birinchi_aloqa",
  "malumot_yuborildi",
  "qiziqarli",
  "to_lov_qilinmoqda",
];

export const CLOSED_STAGES: LeadStage[] = [
  "yutuq",
  "muvaffaqiyatsizlik",
  "vozvrat",
];

export const ALL_STAGES: LeadStage[] = [...PIPELINE_STAGES, ...CLOSED_STAGES];

export const BOSQICH_LABELS: Record<LeadStage, string> = {
  yangi_lead: "Yangi lead",
  aloqa_kutilmoqda: "Aloqa kutilmoqda",
  birinchi_aloqa: "Birinchi aloqa",
  malumot_yuborildi: "Ma'lumot yuborildi",
  qiziqarli: "Qiziqarli",
  to_lov_qilinmoqda: "To'lov qilinmoqda",
  yutuq: "Yutuq",
  muvaffaqiyatsizlik: "Muvaffaqiyatsizlik",
  vozvrat: "Vozvrat",
};

export const MANUAL_LOG_HARAKAT = [
  "qongiroq",
  "sms",
  "email",
  "whatsapp",
  "telegram",
  "izoh",
] as const;

export type ManualLogHarakat = (typeof MANUAL_LOG_HARAKAT)[number];

export const HARAKAT_LABELS: Record<string, string> = {
  yaratildi: "Yaratildi",
  bosqich_ozgardi: "Bosqich o'zgardi",
  rejalashtirildi: "Rejalashtirildi",
  qongiroq: "Qo'ng'iroq",
  sms: "SMS",
  email: "Email",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  izoh: "Izoh",
  created: "Yaratildi",
  call_attempt: "Qo'ng'iroq urinishi",
  call_connected: "Qo'ng'iroq ulandi",
  stage_change: "Bosqich o'zgardi",
  note: "Izoh",
  template_sent: "Shablon yuborildi",
  asset_sent: "Material yuborildi",
  shartnoma: "Shartnoma",
  tayinlandi: "Tayinlandi",
  ogohlantirish: "Ogohlantirish",
  qarz_eslatma: "Qarz eslatmasi",
  nps_boshlandi: "NPS boshlandi",
};

export const STUDENT_STAGES: StudentStage[] = [
  "yangi_oquvchi",
  "guruhga_qoshildi",
  "kursda",
  "pauzada",
  "kurs_tugadi",
  "xulosa_yozildi",
];

export const STUDENT_STAGE_LABELS: Record<StudentStage, string> = {
  yangi_oquvchi: "Yangi o'quvchi",
  guruhga_qoshildi: "Guruhga qo'shildi",
  kursda: "Kursda",
  pauzada: "Pauzada",
  kurs_tugadi: "Kurs tugadi",
  xulosa_yozildi: "Xulosa yozildi",
};

export const STUDENT_STAGE_BADGE_CLASS: Record<StudentStage, string> = {
  yangi_oquvchi: "border-transparent bg-zinc-100 text-zinc-700",
  guruhga_qoshildi: "border-transparent bg-blue-100 text-blue-800",
  kursda: "border-transparent bg-green-100 text-green-800",
  pauzada: "border-transparent bg-amber-100 text-amber-800",
  kurs_tugadi: "border-transparent bg-purple-100 text-purple-800",
  xulosa_yozildi: "border-transparent bg-teal-100 text-teal-800",
};

export const PAYMENT_TYPES: PaymentType[] = ["Naqd", "Uzum", "Ichki"];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Kutilmoqda",
  confirmed: "Tasdiqlangan",
  refunded: "Qaytarilgan",
};

export const PAYMENT_STATUS_BADGE_CLASS: Record<PaymentStatus, string> = {
  pending: "border-transparent bg-amber-100 text-amber-800",
  confirmed: "border-transparent bg-green-100 text-green-800",
  refunded: "border-transparent bg-red-100 text-red-800",
};

export const TARIF_OPTIONS: Tarif[] = ["BAZA", "KASB", "BIZNES", "noma_lum"];

export const TARIF_BADGE_CLASS: Record<Tarif, string> = {
  BAZA: "border-transparent bg-blue-100 text-blue-800",
  KASB: "border-transparent bg-amber-100 text-amber-800",
  BIZNES: "border-transparent bg-emerald-100 text-emerald-800",
  noma_lum: "border-transparent bg-muted text-muted-foreground",
};

export function initials(name: string | null | undefined): string {
  if (!name?.trim()) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
