drop trigger if exists zz_notify_tenancies on public.tenancies;
create trigger zz_notify_tenancies
  after insert on public.tenancies
  for each row execute function public.notify_trigger();