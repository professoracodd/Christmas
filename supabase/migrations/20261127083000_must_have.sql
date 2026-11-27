-- "Can't live without" flag on wishes (kids set it; shoppers see it first).
alter table public.wish_list_items
  add column if not exists must_have boolean not null default false;
grant insert (must_have) on public.wish_list_items to authenticated;
grant update (must_have) on public.wish_list_items to authenticated;
