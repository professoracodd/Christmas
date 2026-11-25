-- Row Level Security policies, column-level grants, role protection, and realtime.

-- 1) Helper functions in a private schema (not exposed through the API).
--    SECURITY DEFINER so policies can look up the caller's profile without recursion.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create function private.my_family_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select family_id from public.profiles where id = (select auth.uid())
$$;

create function private.my_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid())
$$;

revoke execute on function private.my_family_id() from public, anon;
revoke execute on function private.my_role() from public, anon;
grant execute on function private.my_family_id() to authenticated;
grant execute on function private.my_role() to authenticated;

-- 2) Table privileges: start from nothing, grant only what each table needs.
revoke all on public.families, public.profiles, public.wish_list_items,
  public.purchase_status, public.parent_budgets, public.budget_transactions
  from authenticated;

grant select on public.families to authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

grant select, delete on public.wish_list_items to authenticated;
grant insert (family_id, child_id, name, description, estimated_price, product_url, image_url)
  on public.wish_list_items to authenticated;
grant update (name, description, estimated_price, product_url, image_url)
  on public.wish_list_items to authenticated;

-- purchase_status: rows are created by a trigger and removed by cascade; clients may only read and flip the status
grant select on public.purchase_status to authenticated;
grant update (status) on public.purchase_status to authenticated;

grant select on public.parent_budgets to authenticated;
grant insert (parent_id, family_id, budget_amount) on public.parent_budgets to authenticated;
grant update (budget_amount) on public.parent_budgets to authenticated;

grant select, delete on public.budget_transactions to authenticated;
grant insert (parent_id, family_id, description, amount, transaction_date)
  on public.budget_transactions to authenticated;
grant update (description, amount, transaction_date) on public.budget_transactions to authenticated;

-- 3) Policies

-- families: members can read their own family. Creation/changes happen through the backend only.
create policy "members read own family"
  on public.families for select to authenticated
  using (id = private.my_family_id());

-- profiles
create policy "read own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "parents read family profiles"
  on public.profiles for select to authenticated
  using (family_id = private.my_family_id() and private.my_role() = 'parent');

create policy "gift buyers read children profiles"
  on public.profiles for select to authenticated
  using (
    family_id = private.my_family_id()
    and role = 'child'
    and private.my_role() = 'gift_buyer'
  );

create policy "update own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Belt and braces: nobody using the API can change role, family, or id (backend/service role only)
create function public.protect_profile_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.id is distinct from old.id
          or new.family_id is distinct from old.family_id
          or new.role is distinct from old.role) then
    raise exception 'role and family cannot be changed';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_identity
  before update on public.profiles
  for each row execute function public.protect_profile_identity();

revoke execute on function public.protect_profile_identity() from public, anon, authenticated;

-- wish_list_items: a child manages only their own; parents and gift buyers read the whole family's
create policy "read wish list items"
  on public.wish_list_items for select to authenticated
  using (
    family_id = private.my_family_id()
    and (child_id = (select auth.uid()) or private.my_role() in ('parent', 'gift_buyer'))
  );

create policy "children add own items"
  on public.wish_list_items for insert to authenticated
  with check (
    child_id = (select auth.uid())
    and family_id = private.my_family_id()
    and private.my_role() = 'child'
  );

create policy "children edit own items"
  on public.wish_list_items for update to authenticated
  using (child_id = (select auth.uid()) and private.my_role() = 'child')
  with check (
    child_id = (select auth.uid())
    and family_id = private.my_family_id()
    and private.my_role() = 'child'
  );

create policy "children delete own items"
  on public.wish_list_items for delete to authenticated
  using (child_id = (select auth.uid()) and private.my_role() = 'child');

-- purchase_status: adults only. Children have no policy, so they can never read it.
create policy "adults read purchase status"
  on public.purchase_status for select to authenticated
  using (
    family_id = private.my_family_id()
    and private.my_role() in ('parent', 'gift_buyer')
  );

create policy "adults update purchase status"
  on public.purchase_status for update to authenticated
  using (
    family_id = private.my_family_id()
    and private.my_role() in ('parent', 'gift_buyer')
  )
  with check (
    family_id = private.my_family_id()
    and private.my_role() in ('parent', 'gift_buyer')
  );

-- parent_budgets: each parent sees and manages only their own
create policy "parent reads own budget"
  on public.parent_budgets for select to authenticated
  using (parent_id = (select auth.uid()) and private.my_role() = 'parent');

create policy "parent creates own budget"
  on public.parent_budgets for insert to authenticated
  with check (
    parent_id = (select auth.uid())
    and family_id = private.my_family_id()
    and private.my_role() = 'parent'
  );

create policy "parent edits own budget"
  on public.parent_budgets for update to authenticated
  using (parent_id = (select auth.uid()) and private.my_role() = 'parent')
  with check (parent_id = (select auth.uid()) and private.my_role() = 'parent');

-- budget_transactions: each parent sees and manages only their own
create policy "parent reads own transactions"
  on public.budget_transactions for select to authenticated
  using (parent_id = (select auth.uid()) and private.my_role() = 'parent');

create policy "parent adds own transactions"
  on public.budget_transactions for insert to authenticated
  with check (
    parent_id = (select auth.uid())
    and family_id = private.my_family_id()
    and private.my_role() = 'parent'
  );

create policy "parent edits own transactions"
  on public.budget_transactions for update to authenticated
  using (parent_id = (select auth.uid()) and private.my_role() = 'parent')
  with check (parent_id = (select auth.uid()) and private.my_role() = 'parent');

create policy "parent deletes own transactions"
  on public.budget_transactions for delete to authenticated
  using (parent_id = (select auth.uid()) and private.my_role() = 'parent');

-- 4) Realtime: live updates for lists and purchase status (RLS still applies to what each user receives)
alter publication supabase_realtime add table public.wish_list_items, public.purchase_status;
