-- Alfred's comprehensive learning system
-- Tracks all project patterns, team dynamics, and lessons learned

-- Task analytics: Performance data for learning
create table alfred_task_analytics (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  assigned_to uuid not null references users(id),
  estimated_days int,
  actual_days int,
  days_late int default 0,
  was_reworked boolean default false,
  quality_score int, -- 1-5
  collaboration_score int, -- How well team worked together
  blockers text[], -- What blocked progress
  learned_lesson text, -- Key lesson from this task
  project_type text, -- Type of task (design, dev, research, etc)
  team_size int, -- Number of people involved
  created_at timestamp default now(),
  completed_at timestamp
);

-- Team performance patterns
create table alfred_team_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  pattern_type text not null, -- 'productivity_time', 'task_type_strength', 'workload_capacity', 'collaboration_style', etc
  pattern_data jsonb, -- Flexible data structure
  confidence_score float, -- 0-1, how confident in this pattern
  occurrences int default 1, -- How many times observed
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- What works and what doesn't (project lessons)
create table alfred_project_knowledge (
  id uuid primary key default gen_random_uuid(),
  lesson_type text not null, -- 'good_practice', 'bad_practice', 'blocker', 'success_factor', 'risk'
  description text not null,
  context jsonb, -- Metadata: project_type, team_size, duration, etc
  impact_score int, -- 1-10, how much it matters
  occurrences int default 1, -- How many times observed
  tags text[],
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Chat analysis: Team communication patterns
create table alfred_chat_analysis (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null, -- Telegram group ID or similar
  analysis_date timestamp default now(),
  message_count int,
  unique_participants int,
  sentiment_score float, -- -1 to 1
  detected_issues text[], -- Blockers, confusion, etc mentioned
  collaboration_quality text, -- 'excellent', 'good', 'poor'
  key_decisions text[], -- Important decisions made
  action_items text[], -- Tasks/follow-ups identified
  analysis_data jsonb
);

-- Collaboration graph: Who works well together
create table alfred_collaboration_pairs (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references users(id),
  user_b_id uuid not null references users(id),
  collaboration_score float, -- 0-1
  joint_project_count int default 1,
  success_rate float, -- % of projects successful
  notes text,
  updated_at timestamp default now()
);

-- Risk factors detected
create table alfred_risk_factors (
  id uuid primary key default gen_random_uuid(),
  risk_name text not null,
  severity text, -- 'critical', 'high', 'medium', 'low'
  description text,
  detected_in text[], -- Projects/contexts where seen
  mitigation text,
  occurrence_count int default 1,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Create indexes for performance
create index idx_alfred_task_analytics_assigned on alfred_task_analytics(assigned_to);
create index idx_alfred_task_analytics_completed on alfred_task_analytics(completed_at);
create index idx_alfred_team_patterns_user on alfred_team_patterns(user_id);
create index idx_alfred_project_knowledge_type on alfred_project_knowledge(lesson_type);
create index idx_alfred_chat_analysis_date on alfred_chat_analysis(analysis_date);
create index idx_alfred_risk_factors_severity on alfred_risk_factors(severity);
