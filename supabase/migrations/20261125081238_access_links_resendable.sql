-- Lets the owner re-send anyone's link. The token is stored ENCRYPTED (AES-GCM, key held only by the
-- backend function), alongside the hash used for sign-in lookups. Database access alone cannot read links.
alter table public.access_links add column token_enc text;
