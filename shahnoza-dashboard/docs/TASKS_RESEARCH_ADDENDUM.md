# Task Management Research — Addendum (multi-assignee, subtasks, timeline, AI, recurrence)

> Companion to `docs/TASKS_RESEARCH.md`. That doc covered the core rebuild (statuses,
> one-owner + due-date discipline, the per-person/per-role leaderboard). This addendum
> answers the **five new asks** from the owner: (1) multiple assignees, (2) subtasks with
> their own assignees, (3) recurring tasks (assess + improve what exists), (4) a
> timeline / Gantt view, and (5) "full AI integration."
>
> **Context (unchanged):** small Uzbek children's-massage online-course business, team ~5-10.
> Roles `super_admin`, `owner`, `sales_manager`, `sales`, `curator`. Owner works mostly from a
> **phone**; app UI is Uzbek. Stack: Next.js 14 App Router + tRPC v11 + Supabase Postgres with
> RLS; hand-written `Database` types in `src/types/database.ts`. Research only — no code changed.
>
> **What the task module already has** (from `0005_tasks.sql` + `0013_tasks_upgrade.sql`,
> `src/server/api/routers/tasks.ts`): a single `assigned_to`; 4-level priority
> (`urgent/high/normal[=medium]/low`); statuses `backlog→todo→in_progress→review→done` (+`cancelled`);
> `due_date` + `start_date` + `started_at` (cycle time); `labels text[]`; `parent_task_id` self-FK
> (**present, unused in UI**); `estimate_hours`; a simple `recurrence` text (`daily/weekly/monthly`)
> that auto-spawns the next task on completion via `shiftDate()` (UTC date math); `task_comments`;
> and a manager-gated `performance` endpoint (completed, on-time %, open, overdue, workload, avg
> cycle time) that attributes everything to `assigned_to`.
>
> **Bottom line up front:** the two changes worth building are **subtasks with their own
> assignees** (the `parent_task_id` column already exists — this is mostly UI + a recurrence-aware
> router) and a **scoped AI layer** (Uzbek natural-language capture, AI subtask breakdown, a weekly
> Telegram summary) on the Anthropic Claude API. Multiple assignees should be added as
> **collaborators around one DRI**, never as co-owners. A full Gantt and Motion-style
> auto-scheduling are overkill for this team.

---

## A. Multiple assignees + subtasks + checklists

### How ClickUp models multiple assignees
ClickUp gates multiple assignees behind a workspace **ClickApp** (available on every plan); once
enabled you add several people to one task from the task view or quick-assign, and remove them by
hovering the avatar and clicking the ✕. Every assignee sees the task in their own list/views and
gets notifications per their settings. Two facts matter for us: **a task is one shared object** — if
any one assignee closes it, it closes for **everyone** — and for sizing you can set a **separate
time estimate per assignee**.
([ClickUp — Multiple Assignees](https://help.clickup.com/hc/en-us/articles/6309029762583-Multiple-Assignees),
[ClickUp — Multiple Assignees FAQ](https://help.clickup.com/hc/en-us/articles/15910033487639-Multiple-Assignees-FAQ),
[ClickUp — Time estimates per assignee](https://help.clickup.com/hc/en-us/articles/7255524972055-Set-Time-Estimates-per-assignee))

### Subtasks vs checklists (and whether subtasks carry their own assignee/dates)
This is the crux of the owner's ask #2, and ClickUp draws a clean line:

- **Subtasks are full tasks.** Each has its **own assignee(s), own due/start dates, own status,
  comments, and attachments**, and shows up in reports and dashboards. ClickUp allows effectively
  unlimited nesting depth. Use them "when steps need individual ownership, separate due dates, or
  visibility in team reports."
  ([ClickUp — Subtasks concept](https://clickup.com/learn/topic/task-management/concepts/subtasks/),
  [ClickUp — Intro to subtasks](https://help.clickup.com/hc/en-us/articles/6309825777943-Intro-to-subtasks))
- **Checklists are lightweight, in-task todo lists.** Items sit flat (up to ~5 indent levels), **can
  be assigned to a person but cannot carry their own due date/reminder**, and do not appear in
  dashboards. Use them "for personal step-by-step reminders within a task you own entirely."
  ([ClickUp — Use task checklists](https://help.clickup.com/hc/en-us/articles/6309942197783-Use-task-checklists),
  [askyvi — Subtask vs Checklist](https://askyvi.com/clickup/clickup-subtask-vs-checklist/))

So: **the owner's requirement — "subtasks where each subtask can have its own, different
assignee(s)" — is the subtask model, not the checklist model.** Good news: our schema already has
`parent_task_id` (self-FK). A subtask is just a `tasks` row with a parent set; it inherits every
existing field, including `assigned_to` and (once we add it) multi-assignee support. We do **not**
need a new table for subtasks.

### The accountability pitfall of multi-assignee, and how to mitigate it
Every serious source warns that "several people responsible" quietly becomes **nobody
responsible** — diffusion of responsibility: each assignee assumes another will take the lead,
producing "confusion, delays, dropped tasks." Asana's whole position is **one assignee per task**,
built on Apple's **DRI (Directly Responsible Individual)** model; Productive refuses multi-assignee
outright for the same reason.
([Asana — Why one assignee](https://asana.com/resources/why-one-assignee),
[Productive — One task, one assignee (Apple DRI)](https://productive.io/blog/one-task-one-assignee-apple-method/),
[Effective PM — Why the DRI matters](https://www.effectiveprojectmanager.org/blog/why-the-directly-responsible-individual-matters),
[Productive — Why can't I assign multiple assignees](https://help.productive.io/en/articles/5623598-why-can-t-i-assign-multiple-assignees-to-a-task))

The reconciliation the owner actually wants ("several or all people responsible") **without**
diluting ownership: **one primary/DRI + collaborators.** Keep exactly one accountable owner who
carries the task to done; add the others as visible collaborators who get notified and can act. This
is the pattern that satisfies "all people responsible" on the surface while preserving a single name
that the weekly review and the leaderboard can hold accountable.

### ✅ ADOPT for this 5-10 person team
- **Subtasks via the existing `parent_task_id`.** Ship the UI. A subtask is a normal task with its
  own assignee + due date — exactly what the owner asked for. One level deep is enough (a task and
  its steps); do **not** build unlimited nesting.
- **Multiple assignees as `primary DRI + collaborators`.** Add a `task_assignees` join table, keep
  `assigned_to` as the DRI (and mirror it as the `is_primary` row). "Assign to all" becomes "one
  owner + everyone else as collaborators," never a committee. See §E for how this protects the
  leaderboard.
- **Optional per-assignee note, not per-assignee estimates.** ClickUp's per-assignee time estimate
  is overkill here; if you want "who does which part," that's what subtasks are for.

### ❌ OVERKILL / skip
- **Checklists as a separate feature.** They overlap subtasks and can't carry dates/ownership.
  If a truly lightweight "tick-box within one task" is ever wanted, add it later as a tiny
  `task_checklist_items` table (see data model, marked optional) — not now.
- **Deep nested subtask trees, per-assignee estimates, "close closes for all" semantics.** For a
  team this size, one owner closes the task; collaborators are informational.

---

## B. Timeline / Gantt / Calendar view

### What each view actually gives you
- **Calendar** — tasks placed on dates. Best for "what's due this week." We effectively already have
  the data (`due_date`, `start_date`).
- **Timeline** — a horizontal, chronological bar-per-task laid across dates (start→end). It shows
  **phases, milestones, and drag-to-reschedule**, but deliberately **does not model dependencies**.
  Built for "a clear overview of timing" — launches, roadmaps.
  ([ClickUp — Gantt vs Timeline](https://clickup.com/blog/gantt-vs-timeline/),
  [ProcessDriven — Timeline vs Gantt](https://processdriven.co/hub/timeline-view-vs-gantt-view-clickup-tutorial),
  [GoodDay — Gantt vs timeline](https://www.goodday.work/blog/gantt-chart-vs-timeline/))
- **Gantt** — Timeline **plus dependency lines, critical-path analysis, and auto-rescheduling**
  (move a task and its dependents shift). ClickUp supports all four dependency types (finish-to-start,
  etc.) and milestone markers "at risk before they slip."
  ([ClickUp — Gantt chart view](https://clickup.com/features/gantt-chart-view),
  [ClickUp — Gantt milestones](https://clickup.com/blog/gantt-chart-milestones/))

### Is a full Gantt overkill for a small non-engineering team?
**Yes.** Dependencies and critical path pay off when you have long chains of interdependent
engineering work. A children's-massage course business runs mostly **independent, dated tasks**
(sales follow-ups, curator check-ins, a cohort launch). The critical-path machinery would sit unused,
and — decisively — a dependency-graph Gantt is **miserable on a phone**, which is the owner's primary
device.

### ✅ ADOPT — a lightweight, mobile-friendly timeline
- **A read-mostly Timeline** that lays tasks on a horizontal week/month strip using the fields we
  already have (`start_date` → `due_date`), grouped by assignee (reuses the workload grouping) or by
  label (e.g. "August cohort"). Overdue bars in red, milestones as a dot.
- **Drag-to-reschedule on desktop; tap-to-open on mobile.** On a phone the timeline is a scannable
  "who's doing what, when" — the drag interaction is a desktop nicety, not required for value.
- **Group by `parent_task_id`** so a task and its subtasks stack together — this is the cheap,
  genuinely useful "mini-plan" view for a cohort launch.

### ❌ OVERKILL / skip
- **Dependencies, critical path, four dependency types, auto-rescheduling.** No dependency engine.
  If two things truly must be ordered, a due-date and a comment convey it.
- **A full drag-heavy Gantt as the default view.** Keep Kanban + My-tasks + the leaderboard as the
  primary surfaces; Timeline is a fourth, optional view.

---

## C. AI integration (ClickUp Brain / Motion / Height) — scoped to Claude

### The concrete AI features these products ship
**ClickUp Brain** is the reference for "AI inside a task tool." Its relevant capabilities:
- **Natural-language item creation** — describe work in prose; Brain creates the task/subtask/doc/reminder.
- **AI subtask generation** — from just a task name/description, generate a prioritized breakdown of subtasks.
- **Task / thread summaries** — summarize a long comment thread or a task's activity into a short update.
- **AI StandUp / progress reports** — compile each person's tasks + blockers into a daily/weekly
  "meeting-free" summary (bulleted/short/traditional).
- **Ask-AI-anything** over your workspace, **AI writing/replies** (draft comments), **AI autofill**
  of custom fields, and status changes by instruction.
([ClickUp — Create items with Brain AI](https://help.clickup.com/hc/en-us/articles/19953994898711-Create-items-with-Brain-AI),
[ClickUp — Create subtasks with Brain AI](https://help.clickup.com/hc/en-us/articles/16289049593751-Create-subtasks-with-Brain-AI),
[ClickUp — AI Subtask Generator](https://clickup.com/p/features/ai/subtask-generator),
[ClickUp — What is ClickUp Brain](https://help.clickup.com/hc/en-us/articles/12578085238039-What-is-ClickUp-Brain),
[ClickUp — Manage tasks with Brain AI](https://help.clickup.com/hc/en-us/articles/24998833529751-Manage-tasks-with-Brain-AI))

**Motion** = AI **auto-scheduling**: it time-blocks every task onto your calendar by deadline +
priority and re-optimizes "dozens of times a day."
([Motion — AI Task Manager](https://www.usemotion.com/features/ai-task-manager),
[Reclaim — Motion alternatives / auto-scheduling](https://reclaim.ai/blog/motion-alternatives))
**Height** = **autonomous** AI that triages the backlog, de-dupes, updates specs, and auto-drafts
progress updates. (Reminder from the base research: Height announced it was **discontinuing service**
— a heavy autonomous-AI bet is not safe infrastructure.)
([Height](https://height.app/))

### Recommended SCOPED subset for THIS team (Anthropic Claude API)
The winning move is a **small, human-in-the-loop** AI layer in Uzbek that removes typing and
manual re-entry — not an autonomous agent. Everything below is a single Claude API call producing a
**suggestion the user confirms**. Requires an `ANTHROPIC_API_KEY` server-side env var (add to
`.env.example` alongside the existing keys; never expose to the browser).

1. **Uzbek natural-language task capture (highest ROI).** Owner types/dictates
   *"Dilnozaga ertaga soat 3 gacha yangi lidlarga qo'ng'iroq — shoshilinch"* → Claude returns
   structured `{title, assignee, due_date, priority, labels}`. Use **structured outputs**
   (`output_config: {format: {json_schema: …}}`) so the result is guaranteed-parseable JSON that maps
   straight onto the `create` mutation — the user reviews the pre-filled form and taps save. This is
   ClickUp's "create items with Brain," done in one call, and it is the single biggest phone-typing win.
2. **AI subtask breakdown.** On a task, a "Bosqichlarga bo'lish" (break into steps) button sends the
   title/description and returns 3-7 suggested subtasks; the user picks which to create as real
   subtask rows (each then gets its own assignee). Directly pairs with §A.
3. **Weekly AI performance/finance summary → Telegram (owner-facing, phone-first).** A **Vercel cron**
   (the repo already runs `daily-report` at `0 4 * * *` and has `sendMessage`/`broadcast` in
   `src/lib/telegram/bot.ts`) gathers the same numbers the `performance` endpoint computes, hands them
   to Claude, and pushes a short **Uzbek** narrative to the owner's Telegram: who's on time, who's
   behind, overdue count, plus the weekly finance line. This is the Height "auto-drafted update" idea —
   but the raw numbers come from our SQL (deterministic), and Claude only writes the prose. Add a new
   `/api/cron/weekly-summary` route + a `crons` entry (e.g. `0 4 * * 1`, Monday 09:00 Tashkent).
4. **Smart priority / due-date suggestion (small).** When creating a task, suggest a default priority
   and a realistic due date from the title + the assignee's current overdue/workload. A hint the user
   can override — the Motion *principle* ("every task should have a deadline + priority so work can be
   ordered") without the scheduler.

### Cost, latency, privacy, model choice
- **Model:** default **`claude-haiku-4-5`** ($1 / $5 per 1M in/out tokens, 200K context) for the
  high-frequency, low-complexity calls — task parsing, subtask lists, field autofill. Use
  **`claude-sonnet-5`** ($3 / $15 per 1M; intro $2 / $10 through 2026-08-31) only for the weekly
  narrative summary, where quality of prose matters and volume is ~1 call/week. (Model IDs/pricing per
  the bundled `claude-api` reference.)
- **Cost:** these prompts are tiny (a task title + a compact schema is a few hundred tokens). At Haiku
  rates a task-capture call is a fraction of a cent; even hundreds of captures/month are dollars, not
  tens of dollars. The weekly Sonnet summary is negligible. **Cache the fixed system prompt** (prompt
  caching) if capture volume grows.
- **Latency:** one Haiku call is typically well under ~1-2s — fine for a "review the pre-filled form"
  UX. Show a small spinner; never block task creation on the AI (if the call fails, fall back to the
  normal empty form).
- **Privacy — this is the real caution.** The **weekly finance summary sends business financial
  figures to a third-party API.** Mitigations: send **aggregates only** (totals, on-time %, overdue
  counts — never raw customer PII, phone numbers, or per-sale ledgers); keep the `ANTHROPIC_API_KEY`
  server-only; and log every AI call (see `ai_usage_log` in the data model) so usage/cost is auditable.
  Get the owner's explicit OK before any financial data leaves the box. Task-capture text is
  low-sensitivity but still runs server-side via a tRPC procedure, never from the client.

### ❌ OVERKILL / skip
- **Motion-style auto-scheduling / calendar time-blocking.** The team doesn't live in a calendar;
  deadlines + priority ordering is enough. (Flagged as overkill in the base research too.)
- **Height-style autonomous triage / auto-close / self-updating backlog.** Autonomy is a reliability
  risk and Height's shutdown is the cautionary tale. Keep AI as **suggestions a human confirms.**
- **Ask-AI-anything over the whole workspace, RAG, embeddings, agentic loops.** Large build, unclear
  payoff at 5-10 people. Defer.

---

## D. Recurring tasks — assessment + improvements

### What we have, and where it's thin
Current model: a `recurrence` text (`daily`/`weekly`/`monthly`); on completing a recurring task the
`updateStatus` router spawns a fresh `todo` with `shiftDate()` shifting `due_date`/`start_date` by
1 day / 7 days / 1 month using **UTC** `setUTCDate`/`setUTCMonth`. It is **"create-new, on-complete"
only**, with **no end condition** and **no timezone awareness**. That's a reasonable v1 but has real
gaps.

### How ClickUp + Asana model recurrence (the two knobs that matter)
- **"Create new task" vs "reset status."** ClickUp lets a recurrence either **create a new task
  instance** (original kept for records — needed for **per-cycle history and reporting**) or **reset
  the same task's status** back to open (one continuous task that cycles). Our spawn-a-new-row
  approach is the "create new" mode, which is the right default for a **leaderboard** (each cycle is a
  separately-attributable completion).
  ([ClickUp — Use recurring tasks](https://help.clickup.com/hc/en-us/articles/6309885016471-Use-recurring-tasks))
- **Trigger: "when done/closed" vs "on schedule."** ClickUp and Asana both distinguish **recur from
  completion** (next instance only appears when you finish the current one — good for follow-ups that
  must actually happen) from **recur on a fixed schedule/date** (the next instance appears when its
  date arrives **regardless** of whether the previous was done — good for "every Monday" cadences).
  Ours is completion-only, so **a skipped recurring task silently stops recurring** — a real trap for
  a "daily curator check-in."
  ([ClickUp — Recurring on schedule](https://feedback.clickup.com/changelog/recurring-tasks-on-schedule),
  [Asana — Repeating tasks](https://asana.com/apps/repeating-tasks),
  [Asana forum — recur from completion vs due date](https://forum.asana.com/t/recurring-tasks-to-recur-from-completion-date-rather-than-due-date/222068),
  [Coupler — Asana recurring tasks guide](https://blog.coupler.io/asana-recurring-tasks/))

### Timezone handling (Uzbekistan = UTC+5, no DST)
Uzbekistan is **UTC+5 year-round with no daylight saving**, which is a gift: no spring-forward/
fall-back edge cases. But the current UTC date math can still drift for **"monthly on the 31st"**
(month rollover) and for anything where "the next day" should mean the next **Tashkent** day, not the
next UTC day (a task due 23:00 UTC = 04:00 Tashkent shifts on the wrong calendar boundary). Fix by
computing the next occurrence in **`Asia/Tashkent`** local time and storing a
`recurrence_timezone` so the rule is unambiguous and future-proof if the team ever spans zones.

### ✅ ADOPT
- **Add an end condition:** `recurrence_until` (date) and/or `recurrence_count` (N occurrences). A
  recurring task with no stop runs forever, which nobody wants.
- **Add a trigger mode:** `recurrence_mode` = `on_complete` (current behavior, default) **or**
  `on_schedule` (a cron/Vercel job materializes the next instance when its date arrives, so a missed
  daily check-in still reappears). Ship `on_complete` first; `on_schedule` when the daily-cadence
  tasks prove they need it.
- **Timezone-correct date math** anchored to `Asia/Tashkent`; store `recurrence_timezone`.
- **Keep "create new" (spawn a row)** as the default — it's what makes per-cycle leaderboard
  attribution work. Optionally add a `recurrence_series_id` so all instances of one series can be
  grouped/reported together.
- **Carry assignees + subtasks forward.** Once multi-assignee and subtasks exist, the spawn logic must
  copy `task_assignees` rows and (optionally) the subtask templates — Asana copies name, description,
  assignee, and subtasks to each new instance.

### ❌ OVERKILL / skip
- **Full RRULE / iCalendar recurrence** (BYDAY, complex intervals, "2nd Tuesday"). A short set —
  daily / weekly / every-N-weeks / monthly-on-date, plus an end condition — covers this team. The base
  research already flagged "recurring tasks is deceptively fiddly; start dead-simple."
- **"Reset status" mode.** The spawn-a-new-row model is better for reporting; don't add a second
  recurrence paradigm.

---

## E. Multi-assignee vs. the performance leaderboard

### The problem
The `performance` endpoint attributes **every** completed/open/overdue task to a single
`assigned_to`. The moment a task can have several assignees, naive attribution either **double-counts**
(credit the task to everyone → inflated numbers, unfair rankings) or **loses** it (credit no one). And
ClickUp itself shows the ceiling here: with multiple assignees, **one person closing the task closes
it for all**, and there is **no per-assignee "completed by" attribution** — there's a long-standing
open feature request for exactly that. So ClickUp does **not** solve fair per-person credit for
shared tasks; it tracks completion at the task level.
([ClickUp — Multiple Assignees FAQ](https://help.clickup.com/hc/en-us/articles/15910033487639-Multiple-Assignees-FAQ),
[ClickUp — Individual task completion (feature request)](https://feedback.clickup.com/feature-requests/p/individual-task-completion))

### Options
1. **Primary/DRI attribution (recommended).** Credit the task to its **one primary owner** (`assigned_to`
   / the `is_primary` row); collaborators are visible on the task and in a "collaborating on" count,
   but the **completed / on-time / overdue** headline metrics attribute to the DRI only. Simple,
   un-gameable-by-splitting, and it mirrors the DRI principle from §A. Because DRI attribution and the
   existing `assigned_to` column are the same thing, **the current leaderboard keeps working unchanged.**
2. **Split credit** (e.g. 1/N to each assignee). More "fair" in theory, but it (a) makes "tasks
   completed" a fraction, which is confusing on a phone; (b) invites gaming (pile people onto tasks to
   share credit); (c) muddies on-time % and cycle time. Overkill for 5-10 people.
3. **Full credit to all assignees.** Rejected — double counts and rewards adding names.

### ✅ Concrete recommendation
- **Attribute leaderboard metrics to the primary owner (DRI) only.** Keep `assigned_to` as that DRI
  and the source of truth for §4 of the base research. No change to the metric formulas.
- **Add a secondary, non-ranked "collaborations" signal** — a count of tasks where a person is a
  non-primary assignee — shown on their personal stats and the detail view, so contribution is visible
  without polluting the ranking. This is the honest way to acknowledge "several people responsible"
  while keeping the leaderboard fair.
- **Guardrail (from the base self-critique):** the leaderboard is manager-gated and framed as "where do
  we need help," not surveillance — collaborations should read as *support*, not as a second scoreboard.

---

## Proposed Supabase data model (ADDITIVE ONLY)

Every change is `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` — **nothing dropped or
retyped**, matching the discipline in `0013_tasks_upgrade.sql`. Statuses/priorities stay free-text
(no enum migration). Suggested new migration files below.

### `0014_task_assignees.sql` — multiple assignees (DRI + collaborators)
```sql
-- Multiple assignees as one primary (DRI) + collaborators. assigned_to on `tasks`
-- stays the DRI and remains the source of truth for all performance metrics.
CREATE TABLE IF NOT EXISTS task_assignees (
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,   -- exactly one TRUE per task = the DRI
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);
-- Enforce "at most one primary per task" at the app layer (or a partial unique index
-- if desired): CREATE UNIQUE INDEX IF NOT EXISTS uq_task_primary
--   ON task_assignees(task_id) WHERE is_primary;
```
- **Keep `tasks.assigned_to`** as the DRI. On create/update, mirror it into `task_assignees` with
  `is_primary = TRUE`; collaborators are `is_primary = FALSE` rows. The leaderboard reads `assigned_to`
  exactly as today — zero metric change. A "collaborations" count = `task_assignees` rows where
  `is_primary = FALSE`.
- RLS: mirror the existing `tasks` policies (a user can see a task if they are its creator, its
  `assigned_to`, or now a row in `task_assignees`).

### Subtasks — **no migration needed**
`parent_task_id` (self-FK) already exists from `0013`. A subtask is a `tasks` row with
`parent_task_id` set; it inherits `assigned_to`, `task_assignees`, `due_date`, everything. Work is
**UI + router**: a "subtasks" section on the task, a create-subtask form, roll-up counts
(`done/total`) on the parent. Cap the UI at **one level** (no grandchildren) to stay simple.

### `0015_recurrence_upgrade.sql` — better recurrence
```sql
-- Recurrence improvements: end conditions, trigger mode, explicit timezone, series grouping.
-- Existing `recurrence` text ('daily'|'weekly'|'monthly') is kept and still works.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_mode      TEXT;        -- 'on_complete' (default/current) | 'on_schedule'
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_interval  INTEGER;     -- e.g. 2 = every 2 weeks; NULL = 1
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_until     TIMESTAMPTZ; -- stop after this date
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_count     INTEGER;     -- or stop after N occurrences
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_timezone  TEXT DEFAULT 'Asia/Tashkent';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_series_id UUID;        -- groups all instances of one series
CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_series ON tasks(recurrence_series_id);
```
- Update `shiftDate()` to compute the next occurrence in `recurrence_timezone` (Asia/Tashkent),
  honor `recurrence_interval`, and **stop** when `recurrence_until`/`recurrence_count` is reached.
- `on_schedule` mode is materialized by a Vercel cron (a new `/api/cron/recurring` route) that spawns
  due instances even if the prior wasn't completed. Ship `on_complete` first.
- When spawning, copy `task_assignees` (and optionally subtask templates) to the new instance.

### `0016_ai.sql` — AI usage log (+ optional checklist)
```sql
-- Audit + cost tracking for every Claude API call. Nothing sensitive stored beyond
-- a short input preview; keep raw financial data out of the prompt (aggregates only).
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id),
  feature        TEXT NOT NULL,        -- 'task_capture' | 'subtask_breakdown' | 'weekly_summary' | 'priority_suggest'
  model          TEXT,                 -- 'claude-haiku-4-5' | 'claude-sonnet-5'
  input_tokens   INTEGER,
  output_tokens  INTEGER,
  task_id        UUID REFERENCES tasks(id) ON DELETE SET NULL,
  success        BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_log(created_at);

-- OPTIONAL — only if a truly lightweight in-task tick-box is later wanted (subtasks
-- cover most needs). Not part of the first build.
CREATE TABLE IF NOT EXISTS task_checklist_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  is_done    BOOLEAN NOT NULL DEFAULT FALSE,
  position   INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_checklist_task ON task_checklist_items(task_id);
```
- Add **`ANTHROPIC_API_KEY`** to `.env.example` (server-only, like `SUPABASE_SERVICE_ROLE_KEY`). AI
  calls go through **tRPC procedures / cron routes**, never the browser.

### `src/types/database.ts`
Add hand-written `Row`/`Insert`/`Update` entries for `task_assignees`, `ai_usage_log`, and
(optionally) `task_checklist_items`, plus the new `tasks` columns — mirroring how `0013`'s columns are
already reflected there.

---

## Prioritized build plan (max value, least risk)

**Phase 1 — Subtasks (ships the owner's ask #2, near-zero schema risk).**
`parent_task_id` already exists. Build: subtask section on the task view, create-subtask form (own
assignee + due date), `done/total` roll-up on the parent, one-level cap. Make `updateStatus` recurrence
spawn copy subtasks if present. **Highest value-to-risk ratio — no migration.**

**Phase 2 — Multiple assignees as DRI + collaborators (ask #1, done safely).**
`0014_task_assignees.sql`; mirror `assigned_to` as the primary row; multi-select in the task form
(one owner + collaborators); avatars on cards; a "collaborations" count on personal stats. **Leaderboard
untouched** (still attributes to `assigned_to`). Extend RLS to include collaborators.

**Phase 3 — AI task capture + subtask breakdown (ask #5, the visible "AI" win).**
`ANTHROPIC_API_KEY`; a tRPC `ai.parseTask` (Haiku + structured outputs) that pre-fills the create form
from Uzbek prose; a "break into steps" button that proposes subtasks; log to `ai_usage_log`. Human
confirms every suggestion. Biggest phone-typing reduction.

**Phase 4 — Recurrence upgrade (ask #3).**
`0015_recurrence_upgrade.sql`; timezone-correct `shiftDate` (Asia/Tashkent), `recurrence_interval`,
end conditions; carry assignees/subtasks forward. Add `on_schedule` + `/api/cron/recurring` only if
daily-cadence tasks need it.

**Phase 5 — Weekly AI summary → Telegram (ask #5, owner-facing).**
`/api/cron/weekly-summary` (reuse the `daily-report` cron pattern + `sendMessage`); pull `performance`
aggregates + the weekly finance line, Sonnet writes an Uzbek narrative, push to the owner. **Get
explicit owner consent before sending any financial figures; send aggregates only.**

**Phase 6 — Lightweight Timeline view (ask #4).**
A read-mostly horizontal timeline from `start_date`→`due_date`, grouped by assignee or by
`parent_task_id`; overdue in red; drag-to-reschedule on desktop, tap-to-open on mobile. No dependencies.

> If forced to cut: **Phases 1-3 deliver ~80% of the perceived value** (real subtasks, "assign to
> several," and a tangible AI assistant). Timeline (6) is the most deferrable.

---

## Self-critique — what might be wrong, what's risky, what to defer

- **Multi-assignee will be *understood* as co-ownership no matter what the schema says.** Naming one
  person "primary" in the UI is a behavioral norm the tool can't enforce; if the team treats all
  assignees as equal, the DRI benefit evaporates and the leaderboard's fairness argument weakens. This
  is a training/culture problem, not a code problem — the docs should say so plainly.
- **The DRI-only leaderboard under-credits genuine collaborators.** A collaborator who does most of the
  work but isn't the primary gets only a non-ranked "collaborations" tick. That's a deliberate
  trade of *fairness-in-theory* for *un-gameable-simplicity*; on a tiny team where everyone sees the
  rank, it could feel unfair. Split-credit is the alternative if this bites — but it opens its own
  gaming surface.
- **AI capture is only as good as its worst parse.** A wrong assignee or a mis-parsed Uzbek date that
  the user doesn't catch creates silent bad data. Mitigation: **never auto-save** — always pre-fill a
  form the user confirms; log parses; consider a confidence signal. Uzbek + Cyrillic/Latin mixing +
  relative dates ("ertaga", "juma kuni") is exactly where an LLM can slip.
- **Sending financial data to a third party is the single biggest risk here.** Even aggregates can be
  sensitive for a small private business. This needs an explicit owner decision, aggregates-only
  discipline, and an audit log — and it's reasonable for the owner to say "no financial data to the
  AI at all," in which case Phase 5 becomes tasks-only.
- **Recurrence timezone/`on_schedule` is deceptively fiddly** (echoing the base research). "Monthly on
  the 31st," an instance spawned while the previous is still open, editing one instance vs. the series
  — each is a real edge case. Ship `on_complete` + end conditions first; treat `on_schedule` as a
  separate, later increment with its own testing.
- **Every new field/table is surface area to leave blank or misuse.** Subtasks can proliferate;
  collaborators can be added thoughtlessly; recurrence can spawn runaway tasks without an end
  condition (hence making `recurrence_until`/`count` first-class). Keep the one-level subtask cap and
  the end condition non-optional.
- **This is grounded in vendor docs + secondary sources, not a controlled study.** ClickUp/Asana/Motion
  marketing describes what's *possible*, not what a 5-10 person Uzbek education team will *adopt*. The
  safe bets are the boring ones (subtasks, DRI, human-confirmed AISuggestions); the novel ones
  (auto-scheduling, autonomous triage, split credit) are correctly deferred.
- **Deferred on purpose:** dependencies/critical-path Gantt, Motion auto-scheduling, Height-style
  autonomy, ask-AI-anything/RAG, per-assignee estimates, split-credit metrics, full RRULE, and the
  `on_schedule` recurrence mode + checklist table (optional, later).

---

## Sources
- [ClickUp — Multiple Assignees](https://help.clickup.com/hc/en-us/articles/6309029762583-Multiple-Assignees)
- [ClickUp — Multiple Assignees FAQ](https://help.clickup.com/hc/en-us/articles/15910033487639-Multiple-Assignees-FAQ)
- [ClickUp — Multiple Assignees (feature)](https://clickup.com/features/multiple-assignees)
- [ClickUp — Set Time Estimates per assignee](https://help.clickup.com/hc/en-us/articles/7255524972055-Set-Time-Estimates-per-assignee)
- [ClickUp — Subtasks concept](https://clickup.com/learn/topic/task-management/concepts/subtasks/)
- [ClickUp — Intro to subtasks](https://help.clickup.com/hc/en-us/articles/6309825777943-Intro-to-subtasks)
- [ClickUp — Use task checklists](https://help.clickup.com/hc/en-us/articles/6309942197783-Use-task-checklists)
- [askyvi — ClickUp Subtask vs Checklist](https://askyvi.com/clickup/clickup-subtask-vs-checklist/)
- [Asana — Why one assignee](https://asana.com/resources/why-one-assignee)
- [Productive — One task, one assignee (Apple DRI)](https://productive.io/blog/one-task-one-assignee-apple-method/)
- [Effective Project Manager — Why the DRI matters](https://www.effectiveprojectmanager.org/blog/why-the-directly-responsible-individual-matters)
- [Productive — Why can't I assign multiple assignees](https://help.productive.io/en/articles/5623598-why-can-t-i-assign-multiple-assignees-to-a-task)
- [ClickUp — Gantt Chart vs. Timeline](https://clickup.com/blog/gantt-vs-timeline/)
- [ClickUp — Gantt chart view](https://clickup.com/features/gantt-chart-view)
- [ClickUp — Gantt chart milestones](https://clickup.com/blog/gantt-chart-milestones/)
- [ProcessDriven — Timeline view vs Gantt view](https://processdriven.co/hub/timeline-view-vs-gantt-view-clickup-tutorial)
- [GoodDay — Gantt chart vs timeline](https://www.goodday.work/blog/gantt-chart-vs-timeline/)
- [ClickUp — Create items with Brain AI](https://help.clickup.com/hc/en-us/articles/19953994898711-Create-items-with-Brain-AI)
- [ClickUp — Create subtasks with Brain AI](https://help.clickup.com/hc/en-us/articles/16289049593751-Create-subtasks-with-Brain-AI)
- [ClickUp — AI Subtask Generator](https://clickup.com/p/features/ai/subtask-generator)
- [ClickUp — What is ClickUp Brain](https://help.clickup.com/hc/en-us/articles/12578085238039-What-is-ClickUp-Brain)
- [ClickUp — Manage tasks with Brain AI](https://help.clickup.com/hc/en-us/articles/24998833529751-Manage-tasks-with-Brain-AI)
- [Motion — AI Task Manager](https://www.usemotion.com/features/ai-task-manager)
- [Reclaim — Motion alternatives / auto-scheduling](https://reclaim.ai/blog/motion-alternatives)
- [Height](https://height.app/)
- [ClickUp — Use recurring tasks](https://help.clickup.com/hc/en-us/articles/6309885016471-Use-recurring-tasks)
- [ClickUp — Recurring tasks on schedule (changelog)](https://feedback.clickup.com/changelog/recurring-tasks-on-schedule)
- [Asana — Repeating tasks](https://asana.com/apps/repeating-tasks)
- [Asana forum — recur from completion vs due date](https://forum.asana.com/t/recurring-tasks-to-recur-from-completion-date-rather-than-due-date/222068)
- [Coupler.io — Asana recurring tasks guide](https://blog.coupler.io/asana-recurring-tasks/)
- [ClickUp — Individual task completion (feature request)](https://feedback.clickup.com/feature-requests/p/individual-task-completion)
