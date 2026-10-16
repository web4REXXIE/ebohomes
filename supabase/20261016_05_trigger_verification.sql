drop trigger if exists zz_notify_profiles on public.profiles;
create trigger zz_notify_profiles
  after update of verification_status on public.profiles
  for each row
  when (old.verification_status is distinct from new.verification_status)
  execute function public.notify_trigger();