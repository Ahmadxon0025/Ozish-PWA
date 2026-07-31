-- 0042_reels.sql
-- Marketing content planner: the 40-reel launch sequence (v3). Each row is one
-- planned reel/post with its slot (date, stage, CTA), a script (ssenariy), a
-- reference-example link (namuna), and the published link once it's live.

CREATE TABLE IF NOT EXISTS reels (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq              INTEGER,                        -- position in the sequence (1..40)
  title            TEXT NOT NULL,                  -- the reel name / hook
  scheduled_date   DATE,                           -- planned publish date
  stage            TEXT,                           -- bosqich, e.g. "1 — Tanishuv + Syujet"
  cta              TEXT,                           -- call to action / keyword
  platforms        TEXT[] DEFAULT ARRAY['instagram','telegram'],
  status           TEXT NOT NULL DEFAULT 'reja',   -- reja|ssenariy|suratga|montaj|chop
  script           TEXT,                           -- ssenariy (full script)
  reference_link   TEXT,                           -- namuna (example) URL
  published_link   TEXT,                           -- live reel URL
  notes            TEXT,
  is_low_prod      BOOLEAN DEFAULT false,          -- (L) phone-shot, low production
  production_batch TEXT,                           -- Syomka №1 / №2 / №3 / Haftalik
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reels_date ON reels(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_reels_seq  ON reels(seq);

DROP TRIGGER IF EXISTS trg_reels_updated_at ON reels;
CREATE TRIGGER trg_reels_updated_at
  BEFORE UPDATE ON reels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE reels ENABLE ROW LEVEL SECURITY;

-- Internal marketing content — any authenticated app user may read and edit.
DROP POLICY IF EXISTS reels_select ON reels;
CREATE POLICY reels_select ON reels FOR SELECT TO authenticated
  USING (public.app_uid() IS NOT NULL);

DROP POLICY IF EXISTS reels_write ON reels;
CREATE POLICY reels_write ON reels FOR ALL TO authenticated
  USING (public.app_uid() IS NOT NULL)
  WITH CHECK (public.app_uid() IS NOT NULL);

-- Seed the 40-reel v3 sequence (Aug–Sep 2026). Idempotent: only when empty.
INSERT INTO reels (seq, scheduled_date, title, cta, stage, is_low_prod, production_batch)
SELECT * FROM (VALUES
  (1,  DATE '2026-08-04', '"Katta narsa tayyorlanyapti…" — syomka BTS, 15 sek intriga', 'Obuna', '1 — Tanishuv + Syujet', true,  NULL),
  (2,  DATE '2026-08-05', 'SYUJET B seed: "17 yildan keyin bir qarorga keldim. Tez orada aytaman"', 'Obuna', '1 — Tanishuv + Syujet', true,  NULL),
  (3,  DATE '2026-08-06', '"17 yil bolalar massaji qildim. 3 ta ROSTINI aytaman" (R1)', 'Obuna', '1 — Tanishuv + Syujet', false, '№1'),
  (4,  DATE '2026-08-07', '"Nega 17 yildan keyin o''rgatishga qaror qildim" — navbatlar, missiya', 'Obuna', '1 — Tanishuv + Syujet', false, '№1'),
  (5,  DATE '2026-08-08', '"Sizga ''oyiga 15 mln'' va''da qilishyaptimi? 🚩" (R3, halol gradient) ⭐', 'Ulashing', '1 — Tanishuv + Syujet', false, '№1'),
  (6,  DATE '2026-08-09', '"Men bilan bir kun" — klinika POV', 'Obuna', '1 — Tanishuv + Syujet', true,  NULL),
  (7,  DATE '2026-08-11', '"Hamshirasiz? Sizda 90% odamda YO''Q narsa bor" (R2)', '«DAROMAD» → LM-B', '1 — Tanishuv + Syujet', false, '№1'),
  (8,  DATE '2026-08-12', '"Displaziyani uyda sezish — 3 belgi" (R4)', 'Bio → LM-A', '1 — Tanishuv + Syujet', false, '№1'),
  (9,  DATE '2026-08-13', '«6 HAFTA» EP1 — tashxis, birinchi seans + «GURUH» predzapis gate', '«GURUH»', '1 — Tanishuv + Syujet', false, '№1'),
  (10, DATE '2026-08-14', 'SYUJET B payoff: "Asoschilar guruhini ochyapman — 15 kishi. Sizning fikringiz dasturni shakllantiradi"', '«ARIZA»', '2 — Erta sotuv', false, '№1'),
  (11, DATE '2026-08-15', '"''Erim ruxsat bermaydi'' — keling, rostini gaplashamiz" (R5)', 'Komment', '2 — Erta sotuv', false, '№1'),
  (12, DATE '2026-08-17', '"Hech kimdan pul so''ramasdan o''z pulingiz" — uy bekasi istagi', '«DAROMAD»', '2 — Erta sotuv', false, '№1'),
  (13, DATE '2026-08-18', '"35 yoshda kasb almashtirish kechmi?" — ishlaydigan ayol', '«DAROMAD»', '2 — Erta sotuv', false, '№1'),
  (14, DATE '2026-08-19', '"Nega faqat 15 kishi? Ochig''ini aytaman" — real sig''im, soxta emas', '«ARIZA»', '2 — Erta sotuv', false, '№1'),
  (15, DATE '2026-08-20', '«6 HAFTA» EP2 — birinchi o''zgarishlar', 'Kanal', '2 — Erta sotuv', false, 'Haftalik'),
  (16, DATE '2026-08-21', '"Asoschilarga qo''shilganlar kim va nega" — birinchi isbot + oxirgi kun', '«ARIZA»', '2 — Erta sotuv', false, '№1'),
  (17, DATE '2026-08-22', '"Massajist tanlashda 5 savol" — onalar uchun qiymat', 'Saqlang', '3 — Sovutish', false, '№2'),
  (18, DATE '2026-08-23', '"Bolaga zarar yetkazmaslik: xavfsizlik qoidalari" — mini-dars', 'Saqlang', '3 — Sovutish', false, '№2'),
  (19, DATE '2026-08-25', 'Mif-bust: "Yaxshi massajist bolani davolaydi" — eng muhim halollik posti ⭐', 'Saqlang', '3 — Sovutish', false, '№2'),
  (20, DATE '2026-08-26', '"Tanishuv №2: men kimman" — re-introduction (yangi auditoriya uchun)', 'Obuna', '3 — Sovutish', false, '№2'),
  (21, DATE '2026-08-27', '«6 HAFTA» EP3 — yarim yo''l + ona intervyusi', 'Kanal', '3 — Sovutish', false, 'Haftalik'),
  (22, DATE '2026-08-28', '"Kommentlardagi 5 savolga 60 soniyada javob"', 'Komment', '3 — Sovutish', true,  NULL),
  (23, DATE '2026-08-29', '"Kolik va gaz: uyda nima qilish mumkin" — onalar qiymati', 'Bio → LM-A', '3 — Sovutish', false, '№2'),
  (24, DATE '2026-08-31', '"Bu kasbning QORONG''U tomoni" — charchoq, sekin start, mas''uliyat ⭐', 'Obuna', '3 — Sovutish', false, '№2'),
  (25, DATE '2026-09-01', '"Tortikolis nima va qachon shifokorga borish kerak"', 'Bio → LM-A', '3 — Sovutish', false, '№2'),
  (26, DATE '2026-09-02', 'LM-C 1-kun: "3 kunlik bepul mini-kurs boshlandi — bugun 1-dars"', '«MINIKURS»', '4 — LM-C + E''tirozlar', false, '№3'),
  (27, DATE '2026-09-03', 'LM-C 2-kun: "Bugungi dars: 0 dan birinchi mijozgacha yo''l"', '«MINIKURS»', '4 — LM-C + E''tirozlar', false, '№3'),
  (28, DATE '2026-09-04', 'LM-C 3-kun + oxirgi darsni ko''rganlarga bonus (narx kalkulyatori)', '«MINIKURS»', '4 — LM-C + E''tirozlar', false, '№3'),
  (29, DATE '2026-09-05', 'Shogird hikoyasi №1 — A→B, raqam faqat "o''z ishini ochdi" konteksti bilan', 'VSL', '4 — LM-C + E''tirozlar', false, '№2'),
  (30, DATE '2026-09-07', '«6 HAFTA» EP4 — shifokor nazorat ko''rigi (hamkorlik kadri)', 'Kanal', '4 — LM-C + E''tirozlar', false, 'Haftalik'),
  (31, DATE '2026-09-07', '"''Tibbiy bilimim yo''q'' — 0 dan boshlaganlar qanday o''qiydi"', 'VSL', '4 — LM-C + E''tirozlar', false, '№3'),
  (32, DATE '2026-09-08', '"Sentabr guruhi ochildi. 7 kun. Nega ro''yxat yopiladi — real sabab"', 'ARIZA', '5 — Asosiy sotuv', false, '№3'),
  (33, DATE '2026-09-09', '"BAZA, KASB, BIZNES — qaysi biri sizniki? 60 soniyada"', 'ARIZA', '5 — Asosiy sotuv', false, '№3'),
  (34, DATE '2026-09-10', '"Risk BIZDA: 14 kun + 90 kun kafolati qanday ishlaydi" (mezonlari bilan)', 'ARIZA', '5 — Asosiy sotuv', false, '№3'),
  (35, DATE '2026-09-11', '"''Pulim yo''q'' — Nasiya hisobi: 125K/292K. Ekranda sanaymiz"', 'ARIZA', '5 — Asosiy sotuv', false, '№3'),
  (36, DATE '2026-09-12', '«6 HAFTA» EP5 — natija sezilarli, ona hissiyoti', 'ARIZA', '5 — Asosiy sotuv', false, 'Haftalik'),
  (37, DATE '2026-09-13', '«6 HAFTA» EP6 — FINAL. 6 haftalik natija + shifokor xulosasi + ona intervyusi', 'ARIZA', '5 — Asosiy sotuv', false, 'Haftalik'),
  (38, DATE '2026-09-14', '"Bugun oxirgi kun — 23:59. Bosim yo''q, faqat rost" — Shahnoza doira uslubida', 'ARIZA', '5 — Asosiy sotuv', false, '№3'),
  (39, DATE '2026-09-15', '"BOSHLADIK" — birinchi kun, guruh energiyasi, asoschilar tanishuvi', 'Obuna', '6 — Tutib qolish', true,  NULL),
  (40, DATE '2026-09-16', '"Ulgurmaganlar uchun: 10 ta bepul 15 daqiqalik suhbat. Bu kasb sizga mosmi — rostini aytaman"', 'DM', '6 — Tutib qolish', false, '№3')
) AS v(seq, scheduled_date, title, cta, stage, is_low_prod, production_batch)
WHERE NOT EXISTS (SELECT 1 FROM reels);
