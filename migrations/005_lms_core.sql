-- Migration 005: Core LMS Schema
-- Relational tables for agent-driven adaptive learning management system.

-- 1. Learner Profile
create table if not exists lms_learner_profiles (
  owner_id text primary key default '',
  learning_style jsonb not null default '{}'::jsonb,
  preferred_languages text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Subjects
create table if not exists lms_subjects (
  id text primary key,
  owner_id text not null default '',
  slug text not null,
  title text not null,
  status text not null default 'researching' check (status in ('researching', 'placement', 'active', 'completed')),
  difficulty_scale_n int not null default 16 check (difficulty_scale_n >= 1),
  entry_difficulty_level int,
  capstone_project jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lms_subjects_owner_slug_uniq unique (owner_id, slug)
);

create index if not exists lms_subjects_owner_idx on lms_subjects (owner_id, updated_at desc);

-- 3. Sources (BYOS and Agent Research)
create table if not exists lms_sources (
  id text primary key,
  subject_id text not null references lms_subjects(id) on delete cascade,
  track text not null check (track in ('byos', 'agent_research')),
  source_type text not null check (source_type in ('pdf', 'docx', 'xlsx', 'csv', 'markdown', 'web_synthesis')),
  title text not null default '',
  original_uri text not null default '',
  github_md_path text not null default '',
  perspective text not null default 'mixed' check (perspective in ('theory', 'practical', 'critique', 'reference', 'mixed')),
  validation_status text not null default 'pending' check (validation_status in ('pending', 'in_review', 'validated', 'escalated_to_user', 'rejected')),
  review_round int not null default 0 check (review_round between 0 and 3),
  debate_history jsonb not null default '[]'::jsonb,
  file_sha text not null default '',
  content_hash text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lms_sources_subject_idx on lms_sources (subject_id, created_at desc);

-- 4. Learning Nodes
create table if not exists lms_nodes (
  id text primary key,
  subject_id text not null references lms_subjects(id) on delete cascade,
  difficulty_level int not null check (difficulty_level >= 1),
  ordinal int not null default 0,
  title text not null,
  summary text not null default '',
  github_md_path text not null default '',
  project_milestone text not null default '',
  status text not null default 'locked' check (status in ('locked', 'unlocked', 'in_progress', 'completed', 'mastered_by_placement')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lms_nodes_subject_diff_idx on lms_nodes (subject_id, difficulty_level);

-- 5. Node Dependency Edges (DAG)
create table if not exists lms_node_edges (
  node_id text not null references lms_nodes(id) on delete cascade,
  depends_on_node_id text not null references lms_nodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (node_id, depends_on_node_id),
  constraint lms_node_edges_no_self_ref check (node_id <> depends_on_node_id)
);

create index if not exists lms_node_edges_depends_idx on lms_node_edges (depends_on_node_id);

-- 6. RAG Chunks (Relational + FTS; Vector embedding column in 006)
create table if not exists lms_rag_chunks (
  id text primary key,
  subject_id text not null references lms_subjects(id) on delete cascade,
  source_id text not null references lms_sources(id) on delete cascade,
  node_id text references lms_nodes(id) on delete set null,
  github_md_path text not null default '',
  chunk_index int not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lms_rag_chunks_subject_idx on lms_rag_chunks (subject_id);
create index if not exists lms_rag_chunks_source_idx on lms_rag_chunks (source_id);
create index if not exists lms_rag_chunks_node_idx on lms_rag_chunks (node_id);
create index if not exists lms_rag_chunks_fts_idx on lms_rag_chunks using gin (to_tsvector('english', content));

-- 7. Placement Diagnostic Sessions
create table if not exists lms_placement_sessions (
  id text primary key,
  subject_id text not null references lms_subjects(id) on delete cascade,
  low_bound int not null default 1,
  high_bound int not null,
  current_mid int not null,
  resolved_level int,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lms_placement_sessions_subject_idx on lms_placement_sessions (subject_id, created_at desc);

-- 8. Quizzes (Placement, Mastery Gates, Spaced Repetition)
create table if not exists lms_quizzes (
  id text primary key,
  subject_id text not null references lms_subjects(id) on delete cascade,
  node_id text references lms_nodes(id) on delete cascade,
  placement_session_id text references lms_placement_sessions(id) on delete cascade,
  quiz_purpose text not null check (quiz_purpose in ('placement', 'mastery_gate', 'spaced_repetition')),
  quiz_type text not null check (quiz_type in ('mcq_4', 'open_ended', 'code_challenge', 'project_task')),
  difficulty_level int not null default 1,
  prompt_payload jsonb not null default '{}'::jsonb,
  user_submission jsonb,
  passed boolean,
  score numeric,
  agent_feedback text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists lms_quizzes_node_purpose_idx on lms_quizzes (node_id, quiz_purpose);
create index if not exists lms_quizzes_placement_idx on lms_quizzes (placement_session_id);

-- 9. Spaced Repetition (SM-2 / FSRS)
create table if not exists lms_spaced_repetition (
  node_id text primary key references lms_nodes(id) on delete cascade,
  owner_id text not null default '',
  subject_id text not null references lms_subjects(id) on delete cascade,
  stability numeric not null default 1.0,
  difficulty numeric not null default 2.5,
  reps int not null default 0,
  lapses int not null default 0,
  interval_days int not null default 1,
  last_reviewed_at timestamptz,
  next_review_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lms_spaced_repetition_owner_due_idx on lms_spaced_repetition (owner_id, next_review_at);
