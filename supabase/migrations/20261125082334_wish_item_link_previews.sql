-- Link preview ("thumbnail") fields for wish list items, plus safety checks that links/images are web addresses.
alter table public.wish_list_items
  add column link_title text check (char_length(link_title) <= 300),
  add column link_site text check (char_length(link_site) <= 100);

alter table public.wish_list_items
  add constraint wish_list_items_product_url_http check (product_url is null or product_url ~* '^https?://'),
  add constraint wish_list_items_image_url_http check (image_url is null or image_url ~* '^https?://');

-- Children may set the new columns on their own items (column-level grants, as for the others)
grant insert (link_title, link_site) on public.wish_list_items to authenticated;
grant update (link_title, link_site) on public.wish_list_items to authenticated;
