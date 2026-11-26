-- Kids can star their top choices; shoppers see them first.
alter table public.wish_list_items
  add column if not exists top_choice boolean not null default false;

-- Column-level grants, same as the other kid-editable columns.
-- The existing "children edit own items" policy still limits updates to a kid's own wishes.
grant insert (top_choice) on public.wish_list_items to authenticated;
grant update (top_choice) on public.wish_list_items to authenticated;
