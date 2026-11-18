-- WHAT: only a profile with role 'landlord' can insert a listing. Tenants, inspectors and others are refused.
-- WHY: "Landlords manage own listings" only checks landlord_id = auth.uid(), so any signed-in user could insert.
-- HOW: a RESTRICTIVE insert policy. It is ANDed with the existing policy, so the old rule still applies too.
-- DOES NOT: change select, update or delete, the existing policy, or any function that runs as the system.
-- ROLLBACK: drop policy if exists "Only landlords insert listings" on public.listings;

drop policy if exists "Only landlords insert listings" on public.listings;

create policy "Only landlords insert listings"
  on public.listings
  as restrictive
  for insert
  to public
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'landlord'
    )
  );
