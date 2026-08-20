/**
 * One-time seed script — adds the weekly plan tasks to "Asl charm ERP" space.
 * Run from shahnoza-dashboard/:
 *   pnpm tsx scripts/seed-erp-tasks.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const tasks: { title: string; dueDate: string; priority: string }[] = [
  // 24-avgust — Dushanba
  { title: "Client modeli yaratiladi (ism, filial, faollik, izoh)", dueDate: "2025-08-24", priority: "high" },
  { title: "Client migratsiyasi serverga qo'llanadi", dueDate: "2025-08-24", priority: "high" },
  { title: "109 Namangan mijozi bazaga yuklanadi", dueDate: "2025-08-24", priority: "high" },
  { title: "107 Andijon mijozi bazaga yuklanadi", dueDate: "2025-08-24", priority: "high" },
  { title: "Sale modeli yaratiladi (SaleLines bilan)", dueDate: "2025-08-24", priority: "high" },
  { title: "post_sale() yoziladi — sklad − mijoz balansi + kassa + audit atomik", dueDate: "2025-08-24", priority: "high" },
  { title: "Sotuv kiritish ekrani: mijoz qidirish (ism bo'yicha)", dueDate: "2025-08-24", priority: "high" },
  { title: "Tovar qatori qo'shish va o'chirish", dueDate: "2025-08-24", priority: "medium" },
  { title: "Naqd/nasiya tugmasi", dueDate: "2025-08-24", priority: "medium" },
  { title: "Yuborish → kvitansiya sahifasi (kim, nima, qancha, qachon)", dueDate: "2025-08-24", priority: "medium" },

  // 25-avgust — Seshanba
  { title: "To'lov modeli yaratiladi (UZS/USD)", dueDate: "2025-08-25", priority: "high" },
  { title: "USD to'lov → kun kursida konvert, asl dollar saqlanadi", dueDate: "2025-08-25", priority: "high" },
  { title: "To'lov → mijoz balansini atomik kamaytiradi", dueDate: "2025-08-25", priority: "high" },
  { title: "Qaytarish modeli yaratiladi (atomik reversal: sklad + balans birga)", dueDate: "2025-08-25", priority: "high" },
  { title: "To'lov qabul qilish ekrani", dueDate: "2025-08-25", priority: "medium" },
  { title: "Qaytarish kiritish ekrani", dueDate: "2025-08-25", priority: "medium" },
  { title: "Mijoz kartochkasi ekrani: sotildi, to'landi, qoldi, qachondan", dueDate: "2025-08-25", priority: "medium" },

  // 26-avgust — Chorshanba
  { title: "Client modeliga kredit limit maydoni qo'shiladi", dueDate: "2025-08-26", priority: "high" },
  { title: "Limitga yaqinlashsa ogohlantirish", dueDate: "2025-08-26", priority: "high" },
  { title: "Limit oshsa direktor tasdig'i talab qilinadi", dueDate: "2025-08-26", priority: "high" },
  { title: "Aging hisobi: 30 / 60 / 90 kun", dueDate: "2025-08-26", priority: "high" },
  { title: "Aging ranglash: yashil / sariq / qizil", dueDate: "2025-08-26", priority: "medium" },
  { title: "Va'da kuni maydoni va eslatma", dueDate: "2025-08-26", priority: "medium" },
  { title: "Limit oshgan mijozlar ro'yxati", dueDate: "2025-08-26", priority: "medium" },
  { title: "Nasiya holati ekrani: kimda qancha, necha kun o'tgan", dueDate: "2025-08-26", priority: "medium" },

  // 27-avgust — Payshanba
  { title: "Chiqim kategoriyalari ro'yxati yaratiladi", dueDate: "2025-08-27", priority: "high" },
  { title: "Chiqim modeli: qaysi kassa, kategoriya, summa, izoh", dueDate: "2025-08-27", priority: "high" },
  { title: "Kassalararo o'tkazma modeli", dueDate: "2025-08-27", priority: "high" },
  { title: "Avans: kimga, qaysi kassadan, oylikdan ushlanadi belgisi", dueDate: "2025-08-27", priority: "medium" },
  { title: "Kassa holati ekrani: har kassa joriy qoldig'i", dueDate: "2025-08-27", priority: "medium" },
  { title: "Chiqim kiritish ekrani", dueDate: "2025-08-27", priority: "medium" },
  { title: "O'tkazma ekrani", dueDate: "2025-08-27", priority: "medium" },

  // 28-avgust — Juma
  { title: "DailyClose modeli: kim tasdiqladi, qachon", dueDate: "2025-08-28", priority: "high" },
  { title: "Tushum − chiqim = topshiriladigan summa hisobi", dueDate: "2025-08-28", priority: "high" },
  { title: "Qabul qildim tasdiqlash tugmasi", dueDate: "2025-08-28", priority: "medium" },
  { title: "Tasdiqlanmagan kun QIZIL ko'rinadi + backlog", dueDate: "2025-08-28", priority: "medium" },
  { title: "Andijon kunlik hisobot avto-shakllanadi", dueDate: "2025-08-28", priority: "high" },
  { title: "Namangan kunlik hisobot avto-shakllanadi", dueDate: "2025-08-28", priority: "high" },
  { title: "Kun yopish ekrani", dueDate: "2025-08-28", priority: "medium" },
  { title: "Tasdiqlash ekrani", dueDate: "2025-08-28", priority: "medium" },

  // 29-avgust — Shanba
  { title: "Ombor kirimi ekrani", dueDate: "2025-08-29", priority: "high" },
  { title: "Filiallararo o'tkazma: qabul qilinmaguncha ko'chmaydi", dueDate: "2025-08-29", priority: "high" },
  { title: "O'tkazma ikki tomonlama qabul bilan yopiladi", dueDate: "2025-08-29", priority: "high" },
  { title: "Jonli qoldiq: hujjatlardan hisoblanadi, qo'lda yozilmaydi", dueDate: "2025-08-29", priority: "high" },
  { title: "dm² va dona konversiya", dueDate: "2025-08-29", priority: "medium" },
  { title: "Ombor holati ekrani", dueDate: "2025-08-29", priority: "medium" },
  { title: "Haftalik to'liq test: sotuv → to'lov → qaytarish → kun yopish → ombor", dueDate: "2025-08-29", priority: "urgent" },
  { title: "Keyingi hafta doirasi tasdiqlandi", dueDate: "2025-08-29", priority: "medium" },
];

async function main() {
  // 1. Find the "Asl charm ERP" space
  const { data: spaces, error: spErr } = await db
    .from("task_spaces")
    .select("id, name");
  if (spErr) { console.error("Spaces query failed:", spErr.message); process.exit(1); }

  const space = spaces?.find((s) =>
    s.name.toLowerCase().includes("asl") && s.name.toLowerCase().includes("charm"),
  );
  if (!space) {
    console.error("'Asl charm ERP' space not found. Spaces available:", spaces?.map((s) => s.name));
    process.exit(1);
  }
  console.log(`✓ Space found: "${space.name}" (${space.id})`);

  // 2. Insert all tasks
  const rows = tasks.map((t, i) => ({
    title: t.title,
    due_date: t.dueDate,
    priority: t.priority,
    status: "todo" as const,
    space_id: space.id,
    position: i,
  }));

  const { data: inserted, error: insErr } = await db
    .from("tasks")
    .insert(rows)
    .select("id, title");

  if (insErr) { console.error("Insert failed:", insErr.message); process.exit(1); }

  console.log(`✓ ${inserted?.length} tasks created in "${space.name}"`);
  inserted?.forEach((t) => console.log(`  · ${t.title}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
