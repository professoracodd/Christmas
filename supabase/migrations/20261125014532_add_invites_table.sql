-- Single-use invite codes for adding parents and gift buyers to an existing family.
-- Only the backend (service role via the family-admin Edge Function) can touch this table.
-- Codes are stored as SHA-256 hashes, never in plaintext.

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  role public.user_role not null check (role in ('parent', 'gift_buyer')),
  code_hash text not null unique,
  created_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index invites_family_id_idx on public.invites (family_id);
create index invites_created_by_idx on public.invites (created_by);

alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;
