-- The backend (Edge Function, service_role) needs table privileges to create families, profiles and invites.
-- service_role bypasses RLS, but still needs ordinary table grants. Anonymous/authenticated users are unaffected.
grant all on public.families, public.profiles, public.wish_list_items,
  public.purchase_status, public.parent_budgets, public.budget_transactions,
  public.invites
  to service_role;
