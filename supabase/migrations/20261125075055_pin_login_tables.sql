-- (Superseded by 20261125075340_personal_links_replace_pins.sql; kept so repo history matches the database.)
create table public.pins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pin_hmac text not null unique,
  updated_at timestamptz not null default now()
);
create table public.pin_failures (
  id bigint generated always as identity primary key,
  at timestamptz not null default now()
);
create index pin_failures_at_idx on public.pin_failures (at);
alter table public.pins enable row level security;
alter table public.pin_failures enable row level security;
revoke all on public.pins, public.pin_failures from anon, authenticated;
grant all on public.pins, public.pin_failures to service_role;
grant usage, select on sequence public.pin_failures_id_seq to service_role;
drop table public.invites;
