create table if not exists public.job_radar_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.job_radar_state enable row level security;

create policy "Users can read own job radar state"
on public.job_radar_state for select
using (auth.uid() = user_id);

create policy "Users can insert own job radar state"
on public.job_radar_state for insert
with check (auth.uid() = user_id);

create policy "Users can update own job radar state"
on public.job_radar_state for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
