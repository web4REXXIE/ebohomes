-- Fixed fee lines (queue idea 2).
-- A rental offer's "other charges" may now only use these names, once each:
--   Service charge, Agreement fee, Legal fee, Maintenance fee, Estate dues.
-- Free-typed names (for example a viewing fee) are refused. Rent and the caution deposit keep their own lines.
-- Only NEW offers are checked. Offers already stored keep the names they were issued with and still display.
-- Mirrors ALLOWED_CHARGES in lib/rental-offer.ts. If one changes, change the other.
begin;

create or replace function public.eb_offer_charges_total(p jsonb)
 returns numeric
 language plpgsql
 immutable
 set search_path to 'public', 'pg_temp'
as $$
declare e jsonb; tot numeric := 0; n int := 0; v_label text; seen text[] := '{}';
begin
  if p is null then return 0; end if;
  if jsonb_typeof(p) <> 'array' then
    raise exception 'Charges must be a list.' using errcode = '22023';
  end if;
  for e in select value from jsonb_array_elements(p) loop
    n := n + 1;
    if n > 5 then
      raise exception 'You can list up to 5 charges.' using errcode = '22023';
    end if;
    if jsonb_typeof(e) <> 'object' then
      raise exception 'Each charge needs a name and an amount.' using errcode = '22023';
    end if;
    v_label := btrim(coalesce(e->>'label', ''));
    if not (v_label = any (array['Service charge', 'Agreement fee', 'Legal fee', 'Maintenance fee', 'Estate dues'])) then
      raise exception 'Choose each charge from the list. Other names are not allowed.' using errcode = '22023';
    end if;
    if v_label = any (seen) then
      raise exception 'Each charge can only be listed once.' using errcode = '22023';
    end if;
    seen := seen || v_label;
    if coalesce(jsonb_typeof(e->'amount'), '') <> 'number'
       or (e->>'amount')::numeric <= 0 or (e->>'amount')::numeric > 100000000000 then
      raise exception 'Each charge needs an amount above zero.' using errcode = '22023';
    end if;
    tot := tot + (e->>'amount')::numeric;
  end loop;
  return tot;
end;
$$;
revoke all on function public.eb_offer_charges_total(jsonb) from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- ROLLBACK: re-run the function definition from supabase/20261206_05_rental_offers.sql (section C),
--           which allows any name of 2 to 60 characters and up to 8 charges.
