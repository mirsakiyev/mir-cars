alter table public.booking_requests
add column if not exists insurance_responsibility_acknowledged boolean not null default false;

alter table public.booking_requests
add column if not exists insurance_responsibility_acknowledged_at timestamptz;

alter table public.booking_requests
add column if not exists insurance_policy_version text;

alter table public.booking_requests
drop constraint if exists booking_requests_insurance_acknowledgement_check;

alter table public.booking_requests
add constraint booking_requests_insurance_acknowledgement_check check (
  (
    insurance_responsibility_acknowledged is false
    and insurance_responsibility_acknowledged_at is null
    and insurance_policy_version is null
  )
  or (
    insurance_responsibility_acknowledged is true
    and insurance_responsibility_acknowledged_at is not null
    and nullif(trim(insurance_policy_version), '') is not null
  )
);

create or replace function public.stamp_insurance_responsibility_acknowledgement()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.insurance_responsibility_acknowledged is true then
    if tg_op = 'INSERT' then
      new.insurance_responsibility_acknowledged_at = now();
    elsif old.insurance_responsibility_acknowledged is distinct from new.insurance_responsibility_acknowledged
      or new.insurance_responsibility_acknowledged_at is null then
      new.insurance_responsibility_acknowledged_at = now();
    end if;
  else
    new.insurance_responsibility_acknowledged_at = null;
    new.insurance_policy_version = null;
  end if;

  return new;
end;
$$;

drop trigger if exists booking_requests_stamp_insurance_acknowledgement on public.booking_requests;
create trigger booking_requests_stamp_insurance_acknowledgement
before insert or update of insurance_responsibility_acknowledged on public.booking_requests
for each row execute function public.stamp_insurance_responsibility_acknowledgement();

drop policy if exists "Public can create pending booking requests" on public.booking_requests;
drop policy if exists "Public can create customer booking requests" on public.booking_requests;
create policy "Public can create customer booking requests"
on public.booking_requests for insert
to anon, authenticated
with check (
  status in ('pending', 'awaiting_payment')
  and coalesce(booking_status, status) = status
  and nullif(trim(payment_access_token), '') is not null
  and nullif(trim(customer_first_name), '') is not null
  and nullif(trim(customer_last_name), '') is not null
  and nullif(trim(customer_email), '') is not null
  and nullif(trim(customer_phone), '') is not null
  and pickup_date is not null
  and return_date is not null
  and return_date >= pickup_date
  and rental_days is not null
  and rental_days >= 1
  and nullif(trim(driver_license_number), '') is not null
  and nullif(trim(driver_license_region), '') is not null
  and insurance_responsibility_acknowledged is true
  and insurance_responsibility_acknowledged_at is not null
  and insurance_policy_version = '2026-07-14'
);
