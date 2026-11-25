-- Core schema for the Christmas gift coordination app.
-- RLS is enabled on every table here; policies are added in the next migration.
-- With RLS on and no policies, all API access is denied by default.

-- Types
create type public.user_role as enum ('parent', 'child', 'gift_buyer');
create type public.purchase_state as enum ('available', 'purchased');

-- Shared helper: keep updated_at current
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Families
create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);

-- Profiles (one per auth user)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  role public.user_role not null,
  created_at timestamptz not null default now(),
  -- lets other tables prove a user belongs to a specific family
  unique (id, family_id)
);
create index profiles_family_id_idx on public.profiles (family_id);

-- Wish list items (owned by a child)
create table public.wish_list_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  child_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  description text check (char_length(description) <= 2000),
  estimated_price numeric(10, 2) check (estimated_price >= 0),
  product_url text check (char_length(product_url) <= 2000),
  image_url text check (char_length(image_url) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- child must belong to the same family as the item
  foreign key (child_id, family_id) references public.profiles (id, family_id) on delete cascade,
  unique (id, family_id)
);
create index wish_list_items_child_id_idx on public.wish_list_items (child_id);
create index wish_list_items_family_id_idx on public.wish_list_items (family_id);
create trigger wish_list_items_set_updated_at
  before update on public.wish_list_items
  for each row execute function public.set_updated_at();

-- Purchase status (shared; deliberately NO purchaser info and NO timestamps)
create table public.purchase_status (
  item_id uuid primary key,
  family_id uuid not null,
  status public.purchase_state not null default 'available',
  foreign key (item_id, family_id) references public.wish_list_items (id, family_id) on delete cascade
);
create index purchase_status_family_id_idx on public.purchase_status (family_id);

-- Parent budgets (private; one per parent)
create table public.parent_budgets (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null unique,
  family_id uuid not null,
  budget_amount numeric(12, 2) not null default 0 check (budget_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (parent_id, family_id) references public.profiles (id, family_id) on delete cascade
);
create trigger parent_budgets_set_updated_at
  before update on public.parent_budgets
  for each row execute function public.set_updated_at();

-- Budget transactions (private; intentionally NOT linked to wish list items)
create table public.budget_transactions (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null,
  family_id uuid not null,
  description text not null check (char_length(btrim(description)) between 1 and 200),
  amount numeric(12, 2) not null check (amount >= 0),
  transaction_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (parent_id, family_id) references public.profiles (id, family_id) on delete cascade
);
create index budget_transactions_parent_id_idx on public.budget_transactions (parent_id);
create trigger budget_transactions_set_updated_at
  before update on public.budget_transactions
  for each row execute function public.set_updated_at();

-- Role guards: items must belong to a child; budgets must belong to a parent
create function public.require_child_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = new.child_id and family_id = new.family_id and role = 'child'
  ) then
    raise exception 'child_id must reference a child profile in the same family';
  end if;
  return new;
end;
$$;

create function public.require_parent_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = new.parent_id and family_id = new.family_id and role = 'parent'
  ) then
    raise exception 'parent_id must reference a parent profile in the same family';
  end if;
  return new;
end;
$$;

create trigger wish_list_items_require_child
  before insert or update of child_id, family_id on public.wish_list_items
  for each row execute function public.require_child_owner();

create trigger parent_budgets_require_parent
  before insert or update of parent_id, family_id on public.parent_budgets
  for each row execute function public.require_parent_owner();

create trigger budget_transactions_require_parent
  before insert or update of parent_id, family_id on public.budget_transactions
  for each row execute function public.require_parent_owner();

-- Every new wish list item automatically gets an 'available' purchase_status row.
-- SECURITY DEFINER so children can add items even though they can never read or write purchase_status.
create function public.create_purchase_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.purchase_status (item_id, family_id, status)
  values (new.id, new.family_id, 'available');
  return new;
end;
$$;

create trigger wish_list_items_create_purchase_status
  after insert on public.wish_list_items
  for each row execute function public.create_purchase_status();

revoke execute on function public.create_purchase_status() from public, anon, authenticated;

-- Lock everything down until policies exist
alter table public.families enable row level security;
alter table public.profiles enable row level security;
alter table public.wish_list_items enable row level security;
alter table public.purchase_status enable row level security;
alter table public.parent_budgets enable row level security;
alter table public.budget_transactions enable row level security;

-- Anonymous (not logged in) users never need access to any of these tables
revoke all on public.families, public.profiles, public.wish_list_items,
  public.purchase_status, public.parent_budgets, public.budget_transactions
  from anon;
