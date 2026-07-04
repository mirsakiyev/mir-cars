do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant update on table public.booking_reviews to service_role;
  end if;
end
$$;
