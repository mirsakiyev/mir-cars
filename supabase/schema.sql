create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.generate_booking_number()
returns text
language plpgsql
as $$
begin
  return 'MIR-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
end;
$$;

create or replace function public.set_booking_number()
returns trigger
language plpgsql
as $$
begin
  if new.booking_number is null or length(trim(new.booking_number)) = 0 then
    new.booking_number = public.generate_booking_number();
  end if;

  return new;
end;
$$;

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  make text,
  model text,
  year integer,
  trim text,
  category text,
  color text,
  transmission text,
  fuel_type text,
  seats integer,
  daily_rate numeric,
  deposit_amount numeric,
  mileage_limit_per_day integer,
  extra_mileage_fee numeric,
  currency text default 'USD',
  distance_unit text default 'miles',
  status text default 'available',
  is_featured boolean default false,
  description text,
  image_urls text[],
  plate_number text,
  vin text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint vehicles_status_check check (status in ('available', 'rented', 'maintenance', 'inactive'))
);

create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  booking_number text unique default public.generate_booking_number(),
  vehicle_id uuid references public.vehicles(id),
  status text default 'pending',
  booking_status text default 'pending',
  payment_access_token text,
  pickup_date date,
  return_date date,
  pickup_time time,
  return_time time,
  pickup_location text,
  return_location text,
  rental_days integer,
  daily_rate_snapshot numeric,
  deposit_snapshot numeric,
  estimated_subtotal numeric,
  estimated_total numeric,
  currency text default 'USD',
  payment_method text,
  customer_first_name text,
  customer_last_name text,
  customer_email text,
  customer_phone text,
  date_of_birth date,
  driver_license_number text,
  driver_license_region text,
  address_line1 text,
  address_line2 text,
  city text,
  state_province text,
  postal_code text,
  country text default 'US',
  customer_notes text,
  admin_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint booking_requests_status_check check (
    status in ('pending', 'approved', 'declined', 'cancelled', 'awaiting_payment', 'payment_pending', 'paid_pending_approval', 'confirmed', 'paid', 'active', 'completed', 'no_show', 'refunded')
  ),
  constraint booking_requests_booking_status_check check (
    booking_status is null
    or booking_status in ('pending', 'approved', 'declined', 'cancelled', 'awaiting_payment', 'payment_pending', 'paid_pending_approval', 'confirmed', 'paid', 'active', 'completed', 'no_show', 'refunded')
  ),
  constraint booking_requests_dates_check check (return_date is null or pickup_date is null or return_date >= pickup_date)
);

alter table public.booking_requests
add column if not exists payment_method text;

alter table public.booking_requests
add column if not exists booking_status text default 'pending';

alter table public.booking_requests
add column if not exists payment_access_token text;

alter table public.booking_requests
drop constraint if exists booking_requests_status_check;

alter table public.booking_requests
add constraint booking_requests_status_check check (
  status in ('pending', 'approved', 'declined', 'cancelled', 'awaiting_payment', 'payment_pending', 'paid_pending_approval', 'confirmed', 'paid', 'active', 'completed', 'no_show', 'refunded')
);

alter table public.booking_requests
drop constraint if exists booking_requests_booking_status_check;

alter table public.booking_requests
add constraint booking_requests_booking_status_check check (
  booking_status is null
  or booking_status in ('pending', 'approved', 'declined', 'cancelled', 'awaiting_payment', 'payment_pending', 'paid_pending_approval', 'confirmed', 'paid', 'active', 'completed', 'no_show', 'refunded')
);

create table if not exists public.booking_documents (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid references public.booking_requests(id) on delete cascade,
  booking_number text,
  document_type text,
  file_name text,
  file_path text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz default now(),
  constraint booking_documents_type_check check (document_type in ('driver_license', 'supporting_document', 'insurance', 'identity', 'other'))
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid references public.booking_requests(id),
  provider text,
  payment_provider text default 'stripe',
  payment_type text,
  status text default 'pending',
  payment_status text default 'payment_pending',
  amount numeric,
  amount_due numeric,
  amount_paid numeric default 0,
  currency text default 'USD',
  security_deposit_amount numeric,
  security_deposit_status text default 'pending',
  refund_status text default 'none',
  refund_amount numeric default 0,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  stripe_payment_method_id text,
  stripe_charge_id text,
  stripe_receipt_url text,
  payment_completed_at timestamptz,
  payment_failed_reason text,
  paid_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint payments_status_check check (status in ('pending', 'payment_pending', 'requires_action', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded')),
  constraint payments_payment_status_check check (
    payment_status is null
    or payment_status in ('payment_pending', 'requires_action', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded')
  ),
  constraint payments_security_deposit_status_check check (
    security_deposit_status is null
    or security_deposit_status in ('pending', 'authorized', 'captured', 'released', 'refunded', 'not_required')
  ),
  constraint payments_refund_status_check check (
    refund_status is null
    or refund_status in ('none', 'pending', 'refunded', 'partially_refunded', 'failed')
  )
);

alter table public.payments
add column if not exists payment_provider text default 'stripe';

alter table public.payments
add column if not exists payment_status text default 'payment_pending';

alter table public.payments
add column if not exists amount_due numeric;

alter table public.payments
add column if not exists amount_paid numeric default 0;

alter table public.payments
add column if not exists security_deposit_amount numeric;

alter table public.payments
add column if not exists security_deposit_status text default 'pending';

alter table public.payments
add column if not exists refund_status text default 'none';

alter table public.payments
add column if not exists refund_amount numeric default 0;

alter table public.payments
add column if not exists stripe_payment_method_id text;

alter table public.payments
add column if not exists stripe_charge_id text;

alter table public.payments
add column if not exists stripe_receipt_url text;

alter table public.payments
add column if not exists payment_completed_at timestamptz;

alter table public.payments
add column if not exists payment_failed_reason text;

alter table public.payments
drop constraint if exists payments_status_check;

alter table public.payments
add constraint payments_status_check check (status in ('pending', 'payment_pending', 'requires_action', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded'));

alter table public.payments
drop constraint if exists payments_payment_status_check;

alter table public.payments
add constraint payments_payment_status_check check (
  payment_status is null
  or payment_status in ('payment_pending', 'requires_action', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded')
);

alter table public.payments
drop constraint if exists payments_security_deposit_status_check;

alter table public.payments
add constraint payments_security_deposit_status_check check (
  security_deposit_status is null
  or security_deposit_status in ('pending', 'authorized', 'captured', 'released', 'refunded', 'not_required')
);

alter table public.payments
drop constraint if exists payments_refund_status_check;

alter table public.payments
add constraint payments_refund_status_check check (
  refund_status is null
  or refund_status in ('none', 'pending', 'refunded', 'partially_refunded', 'failed')
);

create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  phone text,
  message text,
  status text default 'new',
  created_at timestamptz default now(),
  constraint contact_requests_status_check check (status in ('new', 'contacted', 'closed'))
);

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  email text unique,
  role text default 'admin',
  is_active boolean default true,
  created_at timestamptz default now(),
  constraint admin_users_role_check check (role in ('admin', 'manager', 'viewer'))
);

drop trigger if exists vehicles_set_updated_at on public.vehicles;
create trigger vehicles_set_updated_at
before update on public.vehicles
for each row execute function public.set_updated_at();

drop trigger if exists booking_requests_set_updated_at on public.booking_requests;
create trigger booking_requests_set_updated_at
before update on public.booking_requests
for each row execute function public.set_updated_at();

drop trigger if exists booking_requests_set_booking_number on public.booking_requests;
create trigger booking_requests_set_booking_number
before insert on public.booking_requests
for each row execute function public.set_booking_number();

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

create or replace function public.check_vehicle_availability(
  vehicle_id_input uuid,
  pickup_date_input date,
  return_date_input date
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.vehicles
    where id = vehicle_id_input
      and status = 'available'
  )
  and pickup_date_input is not null
  and return_date_input is not null
  and return_date_input >= pickup_date_input
  and not exists (
    select 1
    from public.booking_requests
    where vehicle_id = vehicle_id_input
      and status in ('pending', 'approved', 'awaiting_payment', 'payment_pending', 'paid_pending_approval', 'confirmed', 'paid', 'active')
      and pickup_date is not null
      and return_date is not null
      and pickup_date <= return_date_input
      and return_date >= pickup_date_input
  );
$$;

create or replace function public.get_payment_checkout_summary(
  booking_number_input text,
  payment_access_token_input text
)
returns table (
  booking_id uuid,
  booking_number text,
  booking_status text,
  payment_status text,
  payment_provider text,
  vehicle_name text,
  vehicle_slug text,
  vehicle_category text,
  vehicle_year integer,
  vehicle_make text,
  vehicle_model text,
  vehicle_trim text,
  mileage_limit_per_day integer,
  pickup_date date,
  pickup_time time,
  return_date date,
  return_time time,
  pickup_location text,
  return_location text,
  rental_days integer,
  daily_rate numeric,
  estimated_subtotal numeric,
  taxes_fees numeric,
  total_due_today numeric,
  currency text,
  security_deposit_amount numeric,
  customer_first_name text,
  customer_last_name text,
  customer_email text,
  customer_phone text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    br.id as booking_id,
    br.booking_number,
    coalesce(br.booking_status, br.status) as booking_status,
    latest_payment.payment_status,
    latest_payment.payment_provider,
    concat_ws(' ', v.year::text, v.color, v.make, v.model, v.trim) as vehicle_name,
    v.slug as vehicle_slug,
    v.category as vehicle_category,
    v.year as vehicle_year,
    v.make as vehicle_make,
    v.model as vehicle_model,
    v.trim as vehicle_trim,
    v.mileage_limit_per_day,
    br.pickup_date,
    br.pickup_time,
    br.return_date,
    br.return_time,
    br.pickup_location,
    br.return_location,
    br.rental_days,
    br.daily_rate_snapshot as daily_rate,
    br.estimated_subtotal,
    null::numeric as taxes_fees,
    br.estimated_total as total_due_today,
    coalesce(br.currency, v.currency, 'USD') as currency,
    br.deposit_snapshot as security_deposit_amount,
    br.customer_first_name,
    br.customer_last_name,
    br.customer_email,
    br.customer_phone
  from public.booking_requests br
  left join public.vehicles v on v.id = br.vehicle_id
  left join lateral (
    select
      p.payment_status,
      p.payment_provider
    from public.payments p
    where p.booking_request_id = br.id
    order by p.created_at desc
    limit 1
  ) latest_payment on true
  where br.booking_number = booking_number_input
    and br.payment_access_token = payment_access_token_input
  limit 1;
$$;

create or replace function public.mark_booking_payment_pending(
  booking_number_input text,
  payment_access_token_input text
)
returns table (
  booking_id uuid,
  booking_number text,
  booking_status text,
  payment_id uuid,
  payment_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_row public.booking_requests%rowtype;
  payment_row public.payments%rowtype;
begin
  select *
  into booking_row
  from public.booking_requests
  where booking_requests.booking_number = booking_number_input
    and booking_requests.payment_access_token = payment_access_token_input
  limit 1;

  if booking_row.id is null then
    raise exception 'Booking not found or payment access token is invalid.';
  end if;

  update public.booking_requests
  set
    status = 'payment_pending',
    booking_status = 'payment_pending'
  where id = booking_row.id
  returning * into booking_row;

  select *
  into payment_row
  from public.payments
  where booking_request_id = booking_row.id
  order by created_at desc
  limit 1;

  if payment_row.id is null then
    insert into public.payments (
      booking_request_id,
      provider,
      payment_provider,
      payment_type,
      status,
      payment_status,
      amount,
      amount_due,
      amount_paid,
      currency,
      security_deposit_amount,
      security_deposit_status,
      refund_status,
      refund_amount,
      stripe_customer_id,
      stripe_checkout_session_id,
      stripe_payment_intent_id,
      stripe_payment_method_id,
      stripe_charge_id
    )
    values (
      booking_row.id,
      'stripe',
      'stripe',
      coalesce(booking_row.payment_method, 'stripe_card'),
      'pending',
      'payment_pending',
      booking_row.estimated_total,
      booking_row.estimated_total,
      0,
      coalesce(booking_row.currency, 'USD'),
      booking_row.deposit_snapshot,
      'pending',
      'none',
      0,
      null,
      null,
      null,
      null,
      null
    )
    returning * into payment_row;
  else
    update public.payments
    set
      provider = 'stripe',
      payment_provider = 'stripe',
      payment_type = coalesce(booking_row.payment_method, payment_row.payment_type, 'stripe_card'),
      status = 'pending',
      payment_status = 'payment_pending',
      amount = booking_row.estimated_total,
      amount_due = booking_row.estimated_total,
      amount_paid = coalesce(payment_row.amount_paid, 0),
      currency = coalesce(booking_row.currency, payment_row.currency, 'USD'),
      security_deposit_amount = booking_row.deposit_snapshot,
      security_deposit_status = coalesce(payment_row.security_deposit_status, 'pending'),
      refund_status = coalesce(payment_row.refund_status, 'none'),
      refund_amount = coalesce(payment_row.refund_amount, 0),
      stripe_customer_id = null,
      stripe_checkout_session_id = null,
      stripe_payment_intent_id = null,
      stripe_payment_method_id = null,
      stripe_charge_id = null,
      payment_failed_reason = null
    where id = payment_row.id
    returning * into payment_row;
  end if;

  return query
  select
    booking_row.id,
    booking_row.booking_number,
    coalesce(booking_row.booking_status, booking_row.status),
    payment_row.id,
    payment_row.payment_status;
end;
$$;

create or replace function public.is_active_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
      and is_active = true
      and role in ('admin', 'manager', 'viewer')
  );
$$;

alter table public.vehicles enable row level security;
alter table public.booking_requests enable row level security;
alter table public.booking_documents enable row level security;
alter table public.payments enable row level security;
alter table public.contact_requests enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists "Public can read available vehicles" on public.vehicles;
create policy "Public can read available vehicles"
on public.vehicles for select
to anon, authenticated
using (status = 'available');

drop policy if exists "Admins can read vehicles" on public.vehicles;
create policy "Admins can read vehicles"
on public.vehicles for select
to authenticated
using (public.is_active_admin());

drop policy if exists "Admins can update vehicles" on public.vehicles;
create policy "Admins can update vehicles"
on public.vehicles for update
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists "Public can create pending booking requests" on public.booking_requests;
drop policy if exists "Public can create customer booking requests" on public.booking_requests;
create policy "Public can create customer booking requests"
on public.booking_requests for insert
to anon, authenticated
with check (status in ('pending', 'awaiting_payment'));

drop policy if exists "Admins can read booking requests" on public.booking_requests;
create policy "Admins can read booking requests"
on public.booking_requests for select
to authenticated
using (public.is_active_admin());

drop policy if exists "Admins can update booking requests" on public.booking_requests;
create policy "Admins can update booking requests"
on public.booking_requests for update
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists "Public can create booking documents" on public.booking_documents;
create policy "Public can create booking documents"
on public.booking_documents for insert
to anon, authenticated
with check (
  booking_request_id is not null
  and document_type in ('driver_license', 'supporting_document', 'insurance', 'identity', 'other')
);

drop policy if exists "Admins can read booking documents" on public.booking_documents;
create policy "Admins can read booking documents"
on public.booking_documents for select
to authenticated
using (public.is_active_admin());

drop policy if exists "Admins can update booking documents" on public.booking_documents;
create policy "Admins can update booking documents"
on public.booking_documents for update
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists "Admins can read payments" on public.payments;
create policy "Admins can read payments"
on public.payments for select
to authenticated
using (public.is_active_admin());

drop policy if exists "Admins can update payments" on public.payments;
create policy "Admins can update payments"
on public.payments for update
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists "Public can create new contact requests" on public.contact_requests;
create policy "Public can create new contact requests"
on public.contact_requests for insert
to anon, authenticated
with check (status = 'new');

drop policy if exists "Admins can read contact requests" on public.contact_requests;
create policy "Admins can read contact requests"
on public.contact_requests for select
to authenticated
using (public.is_active_admin());

drop policy if exists "Admins can update contact requests" on public.contact_requests;
create policy "Admins can update contact requests"
on public.contact_requests for update
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists "Admins can read admin users" on public.admin_users;
create policy "Admins can read admin users"
on public.admin_users for select
to authenticated
using (public.is_active_admin());

drop policy if exists "Admins can update admin users" on public.admin_users;
create policy "Admins can update admin users"
on public.admin_users for update
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

grant usage on schema public to anon, authenticated;
grant select on public.vehicles to anon, authenticated;
grant insert on public.booking_requests to anon, authenticated;
grant insert on public.booking_documents to anon, authenticated;
grant insert on public.contact_requests to anon, authenticated;
grant select, update on public.vehicles to authenticated;
grant select, update on public.booking_requests to authenticated;
grant select, update on public.booking_documents to authenticated;
grant select, update on public.contact_requests to authenticated;
grant select, update on public.payments to authenticated;
grant select, update on public.admin_users to authenticated;
grant execute on function public.check_vehicle_availability(uuid, date, date) to anon, authenticated;
grant execute on function public.get_payment_checkout_summary(text, text) to anon, authenticated;
grant execute on function public.mark_booking_payment_pending(text, text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'booking-documents',
  'booking-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'application/pdf']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can upload booking documents" on storage.objects;
create policy "Public can upload booking documents"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'booking-documents');

drop policy if exists "Admins can read booking document files" on storage.objects;
create policy "Admins can read booking document files"
on storage.objects for select
to authenticated
using (bucket_id = 'booking-documents' and public.is_active_admin());

drop policy if exists "Admins can manage booking document files" on storage.objects;
create policy "Admins can manage booking document files"
on storage.objects for update
to authenticated
using (bucket_id = 'booking-documents' and public.is_active_admin())
with check (bucket_id = 'booking-documents' and public.is_active_admin());
