-- Photos kids upload for a wish (a screenshot or picture when a store blocks link previews).
-- Public bucket: anyone with a photo's long random address can view it; only signed-in people can add,
-- and only into their own folder (<user id>/...). Files are resized to about 1000px in the browser first.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wish-photos', 'wish-photos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "wish photos: add to own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'wish-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "wish photos: remove own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'wish-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
