do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema public to service_role;

    grant select on table
      public.vehicles,
      public.booking_requests,
      public.booking_documents,
      public.payments,
      public.booking_extension_requests
    to service_role;

    grant insert on table
      public.booking_extension_requests,
      public.contact_requests
    to service_role;
  end if;
end
$$;
