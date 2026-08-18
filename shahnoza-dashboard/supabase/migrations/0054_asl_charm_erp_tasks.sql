-- 0054_asl_charm_erp_tasks.sql
-- Seeds the Asl charm ERP week plan (18 Aug–22 Aug 2026) as tracked tasks.
-- Idempotent: skips any task whose title already exists in the Asl charm ERP space.

DO $$
DECLARE
  space UUID;
BEGIN
  SELECT id INTO space FROM task_spaces WHERE name = 'Asl charm ERP' LIMIT 1;
  IF space IS NULL THEN
    RAISE EXCEPTION 'Asl charm ERP space not found — run 0053 first';
  END IF;

  -- DAY 1 — 18 Aug: Receive & process client info
  INSERT INTO tasks (title, description, priority, status, due_date, space_id)
  SELECT v.title, v.description, v.priority, 'todo', v.due_date::TIMESTAMPTZ, space
  FROM (VALUES
    (
      '[1.1] Map A-band info',
      E'Blocker: none (chase client directly)\n\nDefinition of done:\n- Domain name confirmed (nazorat.aslcharm.uz or alternative)\n- VPS payment method confirmed (who pays, which card)\n- Email for server account confirmed (not owner''s personal name)\n- SMS verification phone number confirmed',
      'high',
      '2026-08-18 18:59:00+00'
    ),
    (
      '[1.2] Map B-band info',
      E'Blocker: none\n\nDefinition of done:\n- All 7 users listed: full name, Telegram username, phone, role\n- All Telegram group links/IDs collected (management, Andijon, Namangan, expenses, supply, bot admin)\n- Confirmed which groups the bot joins as admin',
      'high',
      '2026-08-18 18:59:00+00'
    ),
    (
      '[1.3] Map C-band info (Excel files)',
      E'Blocker: client must send Excel files\n\nDefinition of done:\n- Article catalog Excel received (article code, name, category, unit, price — no missing values)\n- Client list Excel received (client name, credit limit, nasiya balance — one name per client)\n- Supplier list Excel received (supplier name, current payable)\n- Chemicals/paints list received (item name, minimum stock level)',
      'high',
      '2026-08-18 18:59:00+00'
    ),
    (
      '[1.4] Map D-band (open decisions)',
      E'Blocker: none\n\nDefinition of done:\n- Distributor pricing: Tashkent price list — Yes/No confirmed; if yes, separate list received\n- ESF/year-report sample received or confirmed not needed this phase\n- Kassa list confirmed: Анд дўкон, Нам дўкон, Асосий касса, Йўлда\n- Пишитиш fee basis confirmed (per kg / per hide / per batch)',
      'medium',
      '2026-08-18 18:59:00+00'
    ),
    (
      '[1.5] Write gap list',
      E'Blocker: tasks 1.1–1.4 must be attempted\n\nDefinition of done:\n- Single document listing everything still missing by end of day\n- Categorized: blocks VPS (A-band) / blocks bot (B-band) / blocks import (C-band) / deferred (D-band)\n- Consolidated follow-up message drafted for client',
      'medium',
      '2026-08-18 18:59:00+00'
    ),
    -- DAY 2 — 19 Aug: VPS + deploy
    (
      '[2.1] Purchase VPS',
      E'HARD BLOCKER: A-band must be resolved (Task 1.1 done). If not resolved by morning of 19 Aug, this day shifts to 20 Aug.\n\nDefinition of done:\n- Hetzner CX22 server rented under Asl Charm''s account\n- Server IP address known\n- SSH access confirmed from local machine',
      'high',
      '2026-08-19 04:59:00+00'
    ),
    (
      '[2.2] Domain + HTTPS',
      E'Blocker: Task 2.1 done, domain confirmed\n\nDefinition of done:\n- nazorat.aslcharm.uz DNS A-record points to server IP\n- Let''s Encrypt SSL certificate installed\n- https://nazorat.aslcharm.uz/health/ returns 200',
      'high',
      '2026-08-19 10:59:00+00'
    ),
    (
      '[2.3] Deploy pipeline',
      E'Blocker: Task 2.1 done\n\nDefinition of done:\n- GitHub repo cloned to server\n- .env file on server with real values (SECRET_KEY, DATABASE_URL, GEMINI_API_KEY, PRODUCTION=true)\n- PostgreSQL installed, database created, migrations run\n- deploy.sh tested: git pull → collectstatic → restart works\n- Full pytest suite run on live PostgreSQL — all 93 tests green\n- https://nazorat.aslcharm.uz/health/ returns 200',
      'high',
      '2026-08-19 18:59:00+00'
    ),
    -- DAY 3 — 20 Aug: Config + users + Telegram bot
    (
      '[3.1] Wire real config',
      E'Blocker: A-band and D-band resolved\n\nDefinition of done:\n- config/values.py updated with real values: BRANCHES, CASH_ACCOUNTS, KURS_TELEGRAM_CHANNEL, DAILY_REPORT_TIME, REPORT_GROUPS\n- Pushed to GitHub, deployed to VPS',
      'high',
      '2026-08-20 04:59:00+00'
    ),
    (
      '[3.2] Create real user accounts',
      E'Blocker: B-band resolved (Task 1.2 done)\n\nDefinition of done:\n- All 7 UserAccount rows created with correct role + branch\n- Each person can log in with their own credentials\n- Branch isolation verified: namangan staff cannot see andijon data',
      'high',
      '2026-08-20 04:59:00+00'
    ),
    (
      '[3.3] Telegram bot setup',
      E'Blocker: B-band resolved (Task 1.2 done)\n\nDefinition of done:\n- Bot created via BotFather in client''s Telegram account\n- Bot token added to .env on VPS (never in GitHub)\n- Bot added to all confirmed groups as admin\n- Bot responds to test message with draft + confirm/reject\n- Scoped daily reports configured per group (management/andijon/namangan/expenses/supply)\n- Bot running as systemd service on VPS with auto-restart',
      'high',
      '2026-08-20 18:59:00+00'
    ),
    -- DAY 4 — 21 Aug: Data import
    (
      '[4.1] Import products',
      E'HARD BLOCKER: C-band Excel files must be received (Task 1.3 done). If not arrived by morning of 21 Aug, escalate to client immediately.\n\nDefinition of done:\n- import_products.py dry-run shows correct row count, no errors\n- --commit run: all articles in database\n- Categories map to 4 confirmed types: хом тери / ярим тайёр / тайёр тери / кимё\n- Minimum stock levels seeded for chemicals/paints\n- Spot check: 5 random articles verified in Django admin',
      'high',
      '2026-08-21 04:59:00+00'
    ),
    (
      '[4.2] Import clients',
      E'Blocker: Client list Excel received and verified\n\nDefinition of done:\n- import_clients.py dry-run shows correct row count, no errors\n- --commit run: all clients in database with correct limits\n- Alias resolution tested (common misspellings map to correct client)\n- Opening nasiya balances loaded as correction documents (not direct balance sets — LAW 2)\n- Spot check: 5 random clients verified',
      'high',
      '2026-08-21 10:59:00+00'
    ),
    (
      '[4.3] Import suppliers',
      E'Blocker: Supplier list Excel received\n\nDefinition of done:\n- import_suppliers.py dry-run clean, --commit run\n- Opening payables loaded correctly\n- Пишитиш processors included in supplier list\n- Spot check: all suppliers verified',
      'high',
      '2026-08-21 10:59:00+00'
    ),
    (
      '[4.4] Deploy imports to VPS',
      E'Blocker: Tasks 4.1–4.3 done locally\n\nDefinition of done:\n- All import commands run on production database\n- Data verified on live server (not just local)\n- Backup taken immediately after import: pg_dump → Google Drive (Asl Charm''s account)',
      'high',
      '2026-08-21 18:59:00+00'
    ),
    -- DAY 5 — 22 Aug: Review + gaps
    (
      '[5.1] End-to-end manual test',
      E'Blocker: Days 2–4 complete\n\nDefinition of done:\n- Log in as Sherzod aka on live VPS from phone\n- Post one complete naqd sale: client → product → qty → price; verify stock decreased + audit log\n- Post one nasiya sale: verify nasiya balance increased\n- Post one day-close: verify RED → confirm → GREEN\n- Send test message to bot: verify draft proposed + confirm button works\n- Owner dashboard shows correct numbers\n- All of the above on nazorat.aslcharm.uz (not local)',
      'high',
      '2026-08-22 04:59:00+00'
    ),
    (
      '[5.2] Gap list + follow-up message',
      E'Blocker: Task 5.1 done\n\nDefinition of done:\n- Written list of everything still outstanding: opening cash balances, open D-band decisions, import errors, UI screens not yet built\n- One consolidated Telegram message drafted for client covering all outstanding items\n- Sent to the Asl Charm group',
      'medium',
      '2026-08-22 10:59:00+00'
    ),
    (
      '[5.3] Confirm next week scope',
      E'Blocker: Task 5.2 done\n\nDefinition of done:\n- Next week priority order agreed: UI screens (sale entry, daily close, owner dashboard, client card, nasiya aging) → Excel export → opening balance ceremony → first training session\n- Written in a message so it carries into next week',
      'medium',
      '2026-08-22 18:59:00+00'
    )
  ) AS v(title, description, priority, due_date)
  WHERE NOT EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.title = v.title AND t.space_id = space
  );
END;
$$;
