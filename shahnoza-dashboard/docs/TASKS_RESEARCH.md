# Task Management Research & Rebuild Plan

> Research doc for rebuilding the task-management feature in the Shahnoza dashboard
> (Next.js 14 + tRPC + Supabase). Written for the developer. The app UI is in Uzbek;
> this document is in English.
>
> **Context:** small Uzbek children's-massage online-course business. Team of ~5-10.
> Roles: `super_admin`, `owner`, `sales_manager`, `sales`, `curator`. The owner works
> mostly from a **mobile phone**. Existing minimal `tasks` table already lives in
> `supabase/migrations/0005_tasks.sql` with `title, description, assigned_to,
> created_by, priority, status, category, related_type, related_id, due_date,
> completed_at, created_at, updated_at`, plus a `task_comments` table, and
> `/tasks/kanban` + `/tasks/my` pages.

---

## 1. Principles of good project/task management (the "true nature")

Tools do not make teams execute. Behaviors do. Every serious source says the same
thing: the software is only a mirror that makes the underlying discipline visible.
The recurring principles:

- **One clear owner per task.** A task should have exactly **one** accountable owner,
  not a committee. Multiple owners produce "confusion, delays, and unclear
  accountability." Contributors can help, but one name carries the task through to
  done — including follow-up, review, and closing it out.
  ([Aurora Training Advantage — Task Ownership](https://auroratrainingadvantage.com/business-administration/key-term/task-ownership/),
  [Medium — Who owns a task](https://maxim-gorin.medium.com/assigning-responsibility-who-owns-a-task-and-when-75e2ea78a38a))
- **Clear, time-bound deadlines.** Work without a due date drifts. "Tasks must have
  clear, time-bound deadlines to drive action," and breaking big goals into small,
  assignable, dated items is the core mechanic of task management.
  ([Slack — What is task management](https://slack.com/blog/productivity/what-is-task-management-and-why-it-matters-for-teams),
  [monday.com — Project management task](https://monday.com/blog/project-management/project-management-task/))
- **Explicit states / workflow.** Work moves through a defined set of states (e.g.
  To Do -> In Progress -> Done). A workflow is "the process through which work moves
  from creation to completion," and visualizing it on a board lets everyone track
  progress at a glance.
  ([Shortcut — Get started](https://help.shortcut.com/hc/en-us/articles/4410865465748-Get-Started-with-the-Basics),
  [TrackingTime — Kanban workflow](https://trackingtime.co/project-management-software/kanban-workflow-management.html))
- **Limit work in progress (WIP).** One of Kanban's core rules: cap how many items
  are "in progress" at once. Limiting WIP keeps people focused, "avoids
  multitasking," prevents bottlenecks, and forces the team to *finish* before
  starting.
  ([AgileFever — Kanban principles](https://agilefever.com/The-Principles-of-Kanban-System-Design-Visualizing-Workflow-and-Managing-the-Flow/))
- **Visibility drives accountability.** Making work visible to everyone improves
  communication and "fosters accountability — team members take ownership of their
  tasks when they are visible to their peers."
  ([Agility at Scale — Visibility](https://agility-at-scale.com/principles/visibility/))
- **Workload balance.** You need to see who is overloaded and who has room. A
  workload view grouped by person is how you rebalance before someone drops a ball.
  ([ClickUp — Workload view](https://help.clickup.com/hc/en-us/articles/6310449699735-Use-Workload-view))
- **A short, regular review cadence.** The teams that improve fastest "review metrics
  weekly in a 30-minute session" — look at each anchor metric, spot what moved,
  assign one action item per metric that needs attention. A focused handful of KPIs
  (5-7) beats a dashboard of thirty.
  ([Workzone — PM KPIs](https://www.workzone.com/blog/project-management-kpis/))

**Takeaway for the rebuild:** the feature's job is not to have many fields. Its job is
to make four things obvious — *who owns it, when it's due, what state it's in, and who
is behind* — and to make the weekly review effortless. Everything else is optional.

---

## 2. How ClickUp works (the reference implementation)

ClickUp is the "everything" tool. It is the benchmark the owner is implicitly asking
for ("à la ClickUp productivity"). Its relevant building blocks:

- **Custom statuses.** Statuses are fully customizable per list. Templates ship for
  Kanban / Scrum / Marketing, and you can rename, recolor, and add states like
  "Waiting on", "Planned", etc. Statuses are how progress is visualized on the board.
  ([ClickUp — Custom task statuses](https://clickup.com/features/custom-task-statuses),
  [ClickUp Help — Use statuses](https://help.clickup.com/hc/en-us/articles/34958607300887-Use-statuses-on-tasks))
- **Priorities.** Exactly **four**, fixed, color-coded levels: **Urgent, High, Normal,
  Low**. Labels are not customizable — but "how you define each priority is up to your
  team." (Deliberately simple; worth copying.)
  ([ClickUp Help — Set priorities](https://help.clickup.com/hc/en-us/articles/6304483666199-Set-task-Priorities))
- **Assignees + due/start dates.** Tasks carry assignees, start dates, and due dates;
  dates feed the calendar, workload, and dashboards.
- **Time tracking & estimates.** Track time manually or automatically; time estimates
  appear in tasks, views, and dashboard cards. Time-in-status can be displayed to see
  how long a task sat in each state.
  ([ClickUp — Time tracking](https://clickup.com/features/project-time-tracking),
  [ClickUp Help — Time estimates](https://help.clickup.com/hc/en-us/articles/7257011414807-See-time-estimates-in-tasks-views-and-Dashboard-cards))
- **Workload view.** Group by assignee, set the work unit (task count, time estimates,
  sprint points, or a custom field), set a period (day/week) and a weekly capacity —
  then see each person's load as a **percentage of capacity** and as tasks-vs-capacity.
  This is the "who is overloaded" screen.
  ([ClickUp Help — Measure your workload](https://help.clickup.com/hc/en-us/articles/30799712357271-Measure-your-workload),
  [ClickUp Help — Capacity](https://help.clickup.com/hc/en-us/articles/30799838221335-Measure-availability-or-capacity-in-Workload-view))
- **Dashboards.** Composable cards — charts, tables, workload, time tracking,
  calculations — sliced "by owner, status, date, or any custom field." Key metrics
  called out: task completion rate, engagement, workload distribution, and "who's on
  time and who's falling behind."
  ([ClickUp — Dashboards](https://clickup.com/features/dashboards),
  [ClickUp — Track productivity](https://clickup.com/blog/how-to-track-productivity/))
- **Goals.** High-level objectives broken into measurable **Targets** (Number,
  True/False, Currency, or Task). Complete all targets -> goal done. This is their OKR
  layer.
  ([ClickUp — Goals](https://clickup.com/features/goals))
- **Per-person productivity reporting (the key one).** Between the Workload view and
  Dashboards, ClickUp lets you "tell at a glance who's on time with their tasks and
  who's falling behind," track task completion rate per person, and build a per-user
  productivity report. This is the exact pattern this project wants to reproduce in a
  much simpler form.
  ([DaSilva Life — Track team performance in ClickUp](https://stackset.com/blog/use-clickup-to-track-team-performance))

**What to actually copy from ClickUp:** the 4-level priority scale, custom statuses,
start+due dates, a workload-by-person view, and a per-person "who's on time / who's
behind" report. **What to skip:** goals/OKRs, deep time tracking, and the composable
dashboard builder — overkill for 5-10 people.

---

## 3. Newer competitors — the 1-2 ideas worth stealing from each

### Linear — speed, cycles, keyboard-first, triage
Linear is built around raw speed: an offline-first local-sync architecture with
sub-50ms responses, and keyboard shortcuts covering "nearly every action" so you can
create, prioritize, assign, label, and schedule an issue without touching the mouse.
Two more ideas: **Cycles** (lightweight time-boxed sprints that *automatically carry
over* incomplete issues) and a **Triage** inbox where new/incoming items land before
they're accepted into the real workflow.
([ConsultEvo — ClickUp vs Linear](https://consultevo.com/clickup-vs-linear-2026-comparison/),
[Cotera — Linear vs ClickUp](https://cotera.co/articles/linear-vs-clickup-comparison))

**Steal:** (1) keyboard-first, near-instant create/assign/close — friction is the
enemy of adoption; (2) the **Triage** idea — a holding state for incoming/unassigned
work so it doesn't pollute active boards. (Auto-carry-over of overdue items is also a
cheap win.)

### Height — autonomous / AI auto-triage
Height repositioned as "AI-first": its AI triages incoming bugs, sets priority,
auto-assigns/escalates critical items, de-duplicates and grooms the backlog, and
**auto-drafts progress updates** for each person to review. (Caveat: Height announced
it was **discontinuing service** on 24 Sept 2025 — a reminder that a heavy AI bet is
not a safe foundation.)
([Height](https://height.app/),
[Skywork — Rise and sunset of Height](https://skywork.ai/skypage/en/Height-App-The-Rise-and-Sunset-of-an-AI-Project-Management-Pioneer/1975012339164966912))

**Steal:** the *concept* of **auto-drafted status updates** (a system-generated "here's
what X did / is overdue this week" summary), which you can do with a plain SQL query —
no AI required. Skip the autonomous triage.

### Motion — AI auto-scheduling
Motion takes all tasks (with deadlines + priorities) and automatically **time-blocks
them onto your calendar**, re-optimizing "dozens of times a day" as meetings run long
or urgent items appear, so deadlines aren't missed.
([Motion — AI Task Manager](https://www.usemotion.com/features/ai-task-manager),
[Motion — Auto-scheduling](https://www.usemotion.com/help/time-management/auto-scheduling))

**Steal:** the *principle* that **every task should have a deadline and a priority so
work can be ordered automatically** — but the full auto-scheduling engine is overkill
here (see recommendations).

### Asana — clarity + recurring + light automation
Asana is "opinionated and clear once you create your first project": task assignments,
due dates, subtasks, multiple views (list/board/timeline), a color-coded status
system, **recurring tasks** for ongoing workflows, and **rule-based automation**
(trigger -> action).
([Everhour — Asana vs Notion](https://everhour.com/blog/asana-vs-notion/),
[Nuclino — Notion vs Asana](https://www.nuclino.com/solutions/notion-vs-asana))

**Steal:** (1) **recurring tasks** — huge for this team (daily/weekly sales follow-ups,
curator check-ins); (2) simple trigger->action rules (e.g. "task overdue -> notify").

### Notion — flexible databases + docs-in-one
Notion is a blank, near-limitless database/workspace: boards, calendars, timelines,
due dates, custom fields, and knowledge/docs living beside the tasks. Power comes from
flexibility, but it "starts blank and grows as you shape it," and reporting depends on
hand-built views.
([Notion — vs Asana](https://www.notion.com/compare-against/comparison-notion-vs-asana),
[Plaky — Notion vs Asana](https://plaky.com/blog/notion-vs-asana/))

**Steal:** the idea of **labels/tags as flexible custom dimensions** (channel, course,
lead-source) instead of inventing a rigid column for every attribute. Skip the
"build-your-own-everything" openness — it slows small teams down.

### Shortcut — Stories / Epics / Iterations, without Jira weight
Shortcut gives agile software teams **Stories** (the unit of work, with subtasks),
**Epics** (group related stories across teams), **Iterations** (time-boxed sprints),
and per-team customizable **Workflows** — "without the complexity of Jira."
([Shortcut — Stories](https://www.shortcut.com/product/stories/),
[Shortcut — Get started](https://help.shortcut.com/hc/en-us/articles/4410865465748-Get-Started-with-the-Basics))

**Steal:** the **Epic** idea in miniature — an optional parent/grouping so several
tasks can roll up under one initiative (e.g. "August cohort launch") without a full
project hierarchy. Iterations/story-points are overkill for a non-engineering team.

---

## 4. What a per-person performance view should show

The goal: a page (and a phone-friendly summary) that answers, per person and per role,
"are they keeping up?" Standard, defensible metrics — kept to a focused handful (5-7),
as the KPI guidance recommends:

- **Tasks completed** (throughput) — count done in the period. Throughput shows whether
  output is "rising, holding, or stalling."
  ([Toggl — Productivity metrics](https://toggl.com/blog/productivity-metrics),
  [Plane — Team performance metrics](https://plane.so/blog/team-performance-metrics-what-to-track-and-why))
- **On-time completion %** — the clearest signal of reliability: "the percentage of
  tasks completed by their deadlines… the clearest signal of whether commitments are
  realistic and whether the team is meeting them."
  ([Workzone — PM KPIs](https://www.workzone.com/blog/project-management-kpis/))
- **Open vs. overdue counts** — how many active tasks the person holds, and how many
  are past due right now. Overdue is the single most actionable red flag.
- **Current workload** — active (non-done) tasks assigned, ideally against a rough
  weekly capacity, à la ClickUp's workload percentage.
  ([ClickUp — Workload](https://help.clickup.com/hc/en-us/articles/30799712357271-Measure-your-workload))
- **Cycle time** — average elapsed time from "started" to "done." "The total elapsed
  time a team spends actively working on a task, from the moment work begins until
  it's ready for delivery." Lower = faster flow; rising = bottleneck.
  ([monday.com — Cycle time](https://monday.com/blog/project-management/cycle-time/),
  [Wrike — Cycle time formula](https://www.wrike.com/blog/what-is-cycle-time-formula/))
- **Leaderboard** — the same metrics ranked **by user** and aggregated **by role**, so
  the owner can compare people fairly and compare the sales team vs. curators.

Benchmarks to remember when reading the numbers: a healthy planned-completion target is
**70-80%**; consistently hitting 90%+ can signal under-planning; below 60% points to
scope/capacity problems.
([BlogWolf — Productivity KPIs](https://blogwolf.com/business-productivity-metrics-explained-10-kpis-every-team-should-track-in-2026/))

---

## 5. Recommendations for THIS team

Opinionated, and sized for 5-10 people where the owner reviews from a phone.

### High value — build these
1. **Clear statuses + one owner + due date on every task.** This is 80% of the value.
   Do not ship a task creation form that lets you skip the assignee or the due date.
2. **A simple 4-level priority** (copy ClickUp exactly: Urgent / High / Normal / Low).
   Small teams need a scale everyone reads the same way; four is the sweet spot.
3. **A per-person + per-role performance view with a leaderboard** (Section 4). This
   is the headline feature the owner asked for. Make it mobile-first: a short ranked
   list of people with completed / on-time% / overdue is perfect on a phone.
4. **Overdue visibility everywhere.** Red badges, an "overdue" filter, and a weekly
   auto-generated summary ("this week: X completed, Y on-time, Z overdue by person").
   This is the Height "auto-drafted update" idea done with a plain SQL query — no AI.
5. **Recurring tasks.** Sales follow-ups and curator check-ins repeat constantly.
   Steal this from Asana; it removes huge manual re-entry.
6. **A Triage / "Inbox" state.** New or unassigned tasks land in `backlog`/triage and
   don't clutter active boards until someone owns them (Linear idea, trivially cheap).
7. **Keyboard-first + fast create on desktop; big-tap, few-field create on mobile.**
   Friction kills adoption. The owner should be able to create/assign/close in seconds
   on a phone.

### Overkill — do NOT build (yet)
- **AI auto-scheduling (Motion-style).** No calendar-blocking engine. The team doesn't
  live in a calendar; deadlines + priority ordering is enough. (And Height's shutdown
  shows heavy AI bets are risky infrastructure.)
- **Time tracking / timesheets.** No one on a 5-10 person sales/education team will log
  hours reliably; the data would be noise. Use `estimate_hours` only as an optional
  planning hint, not enforced tracking.
- **Goals/OKRs module, story points, iterations/sprints.** This isn't an engineering
  team on 2-week cadences. Skip Shortcut's iterations and ClickUp Goals for now.
- **Composable custom-dashboard builder.** One fixed, well-designed performance page
  beats a drag-and-drop dashboard nobody configures.
- **Dependencies / Gantt / multi-level subtasks.** A flat task list with an optional
  parent (mini-Epic) is plenty.

### Proposed task model

Keep the existing table; **add a few columns** rather than rebuild. Existing table
already has `related_type` / `related_id` (nice — reuse it to link a task to a lead or
sale) and a `task_comments` table.

**Statuses** (replace the loose `status` text with a known enum-like set):

| status        | meaning                                  | counts as… |
|---------------|------------------------------------------|------------|
| `backlog`     | captured, not yet committed / triage     | open       |
| `todo`        | committed, owner + due date set          | open       |
| `in_progress` | actively being worked (start `cycle time`)| open      |
| `blocked`     | waiting on someone/something (optional)  | open       |
| `done`        | completed (`completed_at` set)           | closed     |
| `cancelled`   | dropped, excludes from metrics           | closed     |

> Keep it to 4 core states if `blocked`/`cancelled` feel heavy: `backlog -> todo ->
> in_progress -> done`. Add the other two only if they earn their place.

**Priority** (4 fixed levels — migrate the current `medium` default):
`urgent` | `high` | `normal` | `low`. Default `normal`.

**Fields (add to `tasks`):**

| field              | type          | why |
|--------------------|---------------|-----|
| `start_date`       | `timestamptz` | enables cycle-time and "starts today" views |
| `estimate_hours`   | `numeric`     | optional planning hint (NOT enforced tracking) |
| `labels`           | `text[]`      | flexible tags: channel, course, lead-source (Notion idea) |
| `parent_task_id`   | `uuid` (self FK) | optional mini-Epic grouping (Shortcut idea) |
| `recurrence`       | `text`/jsonb  | null, or a rule like `weekly` / RRULE-lite (Asana idea) |
| `started_at`       | `timestamptz` | set when it first enters `in_progress` (for cycle time) |

Already present and reused as-is: `title`, `description`, `assigned_to` (the single
owner), `created_by`, `category`, `related_type`/`related_id`, `due_date`,
`completed_at`, `created_at`, `updated_at`.

Notes:
- Enforce **one `assigned_to`** at the DB/UI level — one owner, on purpose.
- Set `started_at` the first time status becomes `in_progress`; never overwrite it.
- `cancelled` tasks are excluded from all performance metrics.

### Proposed performance metrics — exact formulas

Compute per user and per role, over a selectable period (default: last 30 days, plus a
"this week" toggle). Let **completed** = tasks with `completed_at` in the period and
status `done` (exclude `cancelled`).

| metric | formula |
|--------|---------|
| **Tasks completed** | `count(status = 'done' AND completed_at within period)` |
| **On-time completed** | `count(done AND completed_at <= due_date)` |
| **On-time %** | `on_time_completed ÷ completed × 100` (tasks with no `due_date` excluded from the denominator) |
| **Open tasks** | `count(status IN ('backlog','todo','in_progress','blocked'))` (current, not period-bound) |
| **Overdue tasks** | `count(open AND due_date < now())` |
| **Overdue %** | `overdue ÷ open × 100` |
| **Current workload** | `count(status IN ('todo','in_progress','blocked'))`; optional `÷ weekly_capacity` for a % (ClickUp-style) |
| **Avg cycle time** | `avg(completed_at − started_at)` over completed tasks in the period (fallback to `created_at` when `started_at` is null) |
| **Throughput trend** | tasks completed this period vs. previous period (▲/▼) |

**Leaderboard:** rank users by a small composite the owner can read at a glance —
default sort by **On-time %** (tie-break by **Tasks completed**), with **Overdue**
shown as a red counter. Provide a **role filter** and a role-aggregated row (sales team
vs. curators) so `sales_manager`/`owner` can compare fairly. Show completed / on-time%
/ overdue / workload as the four visible columns; keep cycle time on the detail view.

Interpretation guardrails to surface in the UI copy: **70-80%** on-time/completion is
healthy; **>90%** may mean under-loading; **<60%** signals overload or unrealistic
deadlines
([BlogWolf](https://blogwolf.com/business-productivity-metrics-explained-10-kpis-every-team-should-track-in-2026/)).
And keep the whole report to ~6 numbers — a "focused handful of 5-7 KPIs beats a
dashboard of thirty"
([Workzone](https://www.workzone.com/blog/project-management-kpis/)).

### Review cadence (process, not code — but the tool should serve it)
Bake a **weekly 30-minute review** into how the feature is used: the performance page
*is* the meeting agenda. One action item per person/metric that's off. The auto-drafted
weekly summary (recommendation #4) can be pushed to Telegram/email so the owner reads it
on the phone.
([Workzone](https://www.workzone.com/blog/project-management-kpis/))

---

## 6. Self-critique of these recommendations

- **Performance leaderboards can backfire.** Ranking people by numbers invites gaming
  (splitting tasks to inflate "completed", padding due dates to protect "on-time %")
  and can hurt morale on a tiny team where everyone sees their rank. Mitigation: frame
  it as *team health* not surveillance, weight **on-time %** over raw count, and treat
  low numbers as "where do we need help," not punishment. Consider showing the
  leaderboard to `owner`/`sales_manager` only, and each person their own stats.
- **On-time % is only as honest as the due dates.** If people set soft, generous
  deadlines, the metric looks great and means nothing. It needs a norm that due dates
  are real commitments — a behavior the tool can't enforce.
- **Cycle time on a non-engineering team is noisy.** `started_at` depends on people
  actually moving cards to `in_progress`. If they jump straight to `done`, cycle time
  is garbage. Treat it as a soft, secondary metric, not a headline.
- **"Recurring tasks" is deceptively fiddly.** Timezones (Uzbekistan is UTC+5, no DST),
  "what happens to a missed recurrence," and editing one instance vs. the series are
  real complexity. Start with a dead-simple `weekly`/`daily`/`monthly` string before
  any RRULE ambition.
- **I recommended *against* AI features the owner may have been excited by** (Motion /
  Height style). That's a deliberate bet that reliability + simplicity beats novelty
  for this team — but if the owner specifically wants an "AI assistant" feel, a small
  win is a rules-based auto-summary and smart default due dates, not a scheduler.
- **Adding six columns is still scope.** Every field is a field someone can leave blank.
  If forced to cut, ship only `start_date`, `started_at`, and `labels` first; defer
  `recurrence`, `parent_task_id`, and `estimate_hours` until the core loop is used.
- **This research is grounded in vendor/marketing and secondary sources**, not a
  controlled study; benchmark numbers (70-80% etc.) are rules of thumb, not laws. Treat
  them as conversation starters in the weekly review, not targets to enforce.

---

### Sources
- [Aurora Training Advantage — Task Ownership](https://auroratrainingadvantage.com/business-administration/key-term/task-ownership/)
- [Medium (Gorin) — Who owns a task](https://maxim-gorin.medium.com/assigning-responsibility-who-owns-a-task-and-when-75e2ea78a38a)
- [Slack — What is task management](https://slack.com/blog/productivity/what-is-task-management-and-why-it-matters-for-teams)
- [monday.com — Project management task](https://monday.com/blog/project-management/project-management-task/)
- [AgileFever — Kanban principles](https://agilefever.com/The-Principles-of-Kanban-System-Design-Visualizing-Workflow-and-Managing-the-Flow/)
- [TrackingTime — Kanban workflow](https://trackingtime.co/project-management-software/kanban-workflow-management.html)
- [Agility at Scale — Visibility](https://agility-at-scale.com/principles/visibility/)
- [ClickUp — Dashboards](https://clickup.com/features/dashboards)
- [ClickUp — Custom task statuses](https://clickup.com/features/custom-task-statuses)
- [ClickUp Help — Set priorities](https://help.clickup.com/hc/en-us/articles/6304483666199-Set-task-Priorities)
- [ClickUp — Time tracking](https://clickup.com/features/project-time-tracking)
- [ClickUp Help — Workload view](https://help.clickup.com/hc/en-us/articles/6310449699735-Use-Workload-view)
- [ClickUp Help — Measure your workload](https://help.clickup.com/hc/en-us/articles/30799712357271-Measure-your-workload)
- [ClickUp — Goals](https://clickup.com/features/goals)
- [ClickUp — Track productivity](https://clickup.com/blog/how-to-track-productivity/)
- [DaSilva Life — Track team performance in ClickUp](https://stackset.com/blog/use-clickup-to-track-team-performance)
- [ConsultEvo — ClickUp vs Linear](https://consultevo.com/clickup-vs-linear-2026-comparison/)
- [Cotera — Linear vs ClickUp](https://cotera.co/articles/linear-vs-clickup-comparison)
- [Height](https://height.app/)
- [Skywork — Rise and sunset of Height](https://skywork.ai/skypage/en/Height-App-The-Rise-and-Sunset-of-an-AI-Project-Management-Pioneer/1975012339164966912)
- [Motion — AI Task Manager](https://www.usemotion.com/features/ai-task-manager)
- [Motion — Auto-scheduling](https://www.usemotion.com/help/time-management/auto-scheduling)
- [Everhour — Asana vs Notion](https://everhour.com/blog/asana-vs-notion/)
- [Nuclino — Notion vs Asana](https://www.nuclino.com/solutions/notion-vs-asana)
- [Notion — vs Asana](https://www.notion.com/compare-against/comparison-notion-vs-asana)
- [Shortcut — Stories](https://www.shortcut.com/product/stories/)
- [Shortcut — Get started](https://help.shortcut.com/hc/en-us/articles/4410865465748-Get-Started-with-the-Basics)
- [monday.com — Cycle time](https://monday.com/blog/project-management/cycle-time/)
- [Wrike — Cycle time formula](https://www.wrike.com/blog/what-is-cycle-time-formula/)
- [Toggl — Productivity metrics](https://toggl.com/blog/productivity-metrics)
- [Plane — Team performance metrics](https://plane.so/blog/team-performance-metrics-what-to-track-and-why)
- [Workzone — Project management KPIs](https://www.workzone.com/blog/project-management-kpis/)
- [BlogWolf — Productivity KPIs](https://blogwolf.com/business-productivity-metrics-explained-10-kpis-every-team-should-track-in-2026/)
