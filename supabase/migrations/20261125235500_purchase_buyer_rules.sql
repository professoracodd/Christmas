-- Who bought what, and who may undo it.
--  * Marking a gift bought records the buyer (the signed-in person) and when.
--  * Only that buyer can mark it "still needed" again, except the owner (Mom, the first parent), who can undo anyone's.
--  * Nobody can take over a purchase someone else already made.
-- Enforced in the database, so it holds no matter what the app shows.

alter table public.purchase_status
  add column if not exists purchased_by uuid references public.profiles (id) on delete set null,
  add column if not exists purchased_at timestamptz;

-- Owner = the first parent created in the caller's family (same rule the family-admin function uses)
create or replace function private.is_family_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid())
      and me.role = 'parent'
      and me.id = (
        select p.id from public.profiles p
        where p.family_id = me.family_id and p.role = 'parent'
        order by p.created_at asc limit 1
      )
  )
$$;
revoke execute on function private.is_family_owner() from public, anon;
grant execute on function private.is_family_owner() to authenticated;

create or replace function private.guard_purchase()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  -- Changes made from the dashboard or the server (no signed-in user) are not restricted
  if me is null then
    return new;
  end if;

  if new.status = 'purchased' and old.status = 'available' then
    new.purchased_by := me;
    new.purchased_at := now();
  elsif new.status = 'available' and old.status = 'purchased' then
    if old.purchased_by is distinct from me and not private.is_family_owner() then
      raise exception 'Only the person who bought this (or Mom) can undo it' using errcode = '42501';
    end if;
    new.purchased_by := null;
    new.purchased_at := null;
  else
    -- no status change: keep who bought it as it was
    new.purchased_by := old.purchased_by;
    new.purchased_at := old.purchased_at;
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_purchase() from public, anon;

drop trigger if exists purchase_status_guard on public.purchase_status;
create trigger purchase_status_guard
  before update on public.purchase_status
  for each row execute function private.guard_purchase();
