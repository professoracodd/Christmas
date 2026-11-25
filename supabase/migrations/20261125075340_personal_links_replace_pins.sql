-- Personal links replace PINs. Each person gets a long random token (in their link); only its
-- SHA-256 hash is stored, so a link cannot be read back from the database. Backend-only (service_role).

create table public.access_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

alter table public.access_links enable row level security;
revoke all on public.access_links from anon, authenticated;
grant all on public.access_links to service_role;

drop table public.pins;
drop table public.pin_failures;
