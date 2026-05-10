-- 014_anthropic_usage.sql
--
-- P1-13: track per-user/per-day Anthropic spend so we can attribute cost
-- after the rate limiter rejects abusive callers, and so we can build a
-- billing surface later. The rate limiter itself runs in Upstash (no DB
-- round-trip on the hot path); this table is a daily rollup written from
-- the agent layer when a successful Anthropic call returns usage stats.
--
-- Append-only by design: the `usage_date` PK keeps one row per user/day,
-- and we UPSERT incrementally as calls land.

create table if not exists public.anthropic_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  -- Per-stage breakdown so we can attribute cost to classifier vs. fp-checker
  -- vs. action-agent if a single stage starts dominating spend.
  stage text not null check (stage in ('classifier', 'fp_checker', 'action_agent', 'other')),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  call_count integer not null default 0 check (call_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date, stage)
);

create index if not exists anthropic_usage_user_date_idx
  on public.anthropic_usage (user_id, usage_date desc);

-- RLS: users can read their own usage; only the service role writes.
alter table public.anthropic_usage enable row level security;

drop policy if exists "anthropic_usage_select_own" on public.anthropic_usage;
create policy "anthropic_usage_select_own"
  on public.anthropic_usage
  for select
  using (auth.uid() = user_id);

-- No public insert/update/delete policy: service role only.
-- (Service role bypasses RLS, so explicit policies are unnecessary.)

comment on table public.anthropic_usage is
  'Daily per-user Anthropic token spend, broken out by pipeline stage. Written by the agent layer; read by the dashboard/billing surface. See P1-13 in CODE_REVIEW_2026-05-09.md.';
