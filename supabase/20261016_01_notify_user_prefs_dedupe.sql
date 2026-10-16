create or replace function public.notify_user(p_user uuid, p_title text, p_message text, p_link text, p_type text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_type text := coalesce(p_type, 'general');
  prefs public.notification_preferences%rowtype;
begin
  if p_user is null then
    return;
  end if;

  -- Security alerts and verification results are always delivered.
  -- Everything else respects the person's saved preferences.
  if v_type not in ('security', 'verification') then
    select * into prefs
    from public.notification_preferences
    where user_id = p_user;

    if found then
      if not prefs.in_app_enabled then
        return;
      end if;
      if (v_type = 'message' and not prefs.messages)
         or (v_type in ('application', 'tenancy', 'payment') and not prefs.applications)
         or (v_type = 'listing' and not prefs.listings)
         or (v_type = 'renewal' and not prefs.renewals) then
        return;
      end if;
    end if;
  end if;

  -- Duplicate guard: skip an identical unread notification created in the
  -- last 10 seconds (protects against trigger cascades and double clicks).
  if exists (
    select 1
    from public.notifications n
    where n.user_id = p_user
      and n.type = v_type
      and n.title = p_title
      and n.message is not distinct from p_message
      and n.link is not distinct from p_link
      and n.read = false
      and n.created_at > now() - interval '10 seconds'
  ) then
    return;
  end if;

  insert into public.notifications (user_id, type, title, message, link, read)
  values (p_user, v_type, p_title, p_message, p_link, false);
exception when others then
  raise warning 'notify_user failed for user %: %', p_user, sqlerrm;
end;
$function$;