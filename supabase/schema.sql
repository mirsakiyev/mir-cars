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

create or replace function public.normalize_booking_number(value text)
returns text
language sql
immutable
as $$
  select nullif(upper(regexp_replace(trim(coalesce(value, '')), '\s+', '', 'g')), '');
$$;

create or replace function public.generate_booking_number()
returns text
language plpgsql
as $$
declare
  allowed_chars constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  candidate text;
  random_bytes bytea;
  attempt integer;
  byte_index integer;
begin
  for attempt in 1..24 loop
    candidate := '';
    random_bytes := gen_random_bytes(5);

    for byte_index in 0..4 loop
      candidate := candidate || substr(allowed_chars, (get_byte(random_bytes, byte_index) % length(allowed_chars)) + 1, 1);
    end loop;

    if to_regclass('public.booking_requests') is null
      or not exists (
        select 1
        from public.booking_requests
        where booking_number = candidate
      )
    then
      return candidate;
    end if;
  end loop;

  raise exception 'Could not generate a unique Trip ID after multiple attempts.';
end;
$$;

create or replace function public.set_booking_number()
returns trigger
language plpgsql
as $$
begin
  new.booking_number = public.normalize_booking_number(new.booking_number);

  if new.booking_number is null then
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
  pickup_instructions text,
  rental_agreement_url text,
  agreement_status text default 'not_ready',
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
add column if not exists pickup_instructions text;

alter table public.booking_requests
add column if not exists rental_agreement_url text;

alter table public.booking_requests
add column if not exists agreement_status text default 'not_ready';

alter table public.booking_requests
drop constraint if exists booking_requests_agreement_status_check;

alter table public.booking_requests
add constraint booking_requests_agreement_status_check check (
  agreement_status is null
  or agreement_status in ('not_ready', 'pending', 'ready', 'signed')
);

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
  booking_request_id uuid references public.booking_requests(id) on delete set null,
  trip_id text,
  preferred_contact_method text,
  request_type text default 'contact',
  status text default 'new',
  created_at timestamptz default now(),
  constraint contact_requests_request_type_check check (
    request_type is null or request_type in ('contact', 'lost_and_found')
  ),
  constraint contact_requests_status_check check (status in ('new', 'contacted', 'closed'))
);

alter table public.contact_requests
add column if not exists request_type text default 'contact';

alter table public.contact_requests
add column if not exists booking_request_id uuid references public.booking_requests(id) on delete set null;

alter table public.contact_requests
add column if not exists trip_id text;

alter table public.contact_requests
add column if not exists preferred_contact_method text;

alter table public.contact_requests
drop constraint if exists contact_requests_request_type_check;

alter table public.contact_requests
add constraint contact_requests_request_type_check check (
  request_type is null or request_type in ('contact', 'lost_and_found')
);

create table if not exists public.booking_extension_requests (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid references public.booking_requests(id) on delete cascade,
  trip_id text not null,
  customer_email text,
  customer_phone text,
  requested_return_date date not null,
  requested_return_time time,
  message text,
  status text default 'pending',
  created_at timestamptz default now(),
  constraint booking_extension_requests_status_check check (
    status in ('pending', 'approved', 'declined', 'cancelled')
  )
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

create index if not exists booking_requests_vehicle_dates_status_idx
on public.booking_requests (vehicle_id, status, pickup_date, return_date)
where pickup_date is not null and return_date is not null;

create index if not exists booking_requests_payment_lookup_idx
on public.booking_requests (booking_number, payment_access_token);

create index if not exists payments_booking_created_idx
on public.payments (booking_request_id, created_at desc);

create index if not exists contact_requests_type_created_idx
on public.contact_requests (request_type, created_at desc);

create index if not exists contact_requests_booking_request_idx
on public.contact_requests (booking_request_id, created_at desc);

create index if not exists contact_requests_trip_id_idx
on public.contact_requests (trip_id);

create index if not exists booking_extension_requests_booking_idx
on public.booking_extension_requests (booking_request_id, created_at desc);

create index if not exists booking_extension_requests_trip_id_idx
on public.booking_extension_requests (trip_id);

create or replace function public.check_vehicle_availability(
  vehicle_id_input uuid,
  pickup_date_input date,
  return_date_input date,
  pickup_time_input time default null,
  return_time_input time default null
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
  and (
    return_date_input > pickup_date_input
    or coalesce(return_time_input, time '23:59:59') > coalesce(pickup_time_input, time '00:00')
  )
  and not exists (
    select 1
    from public.booking_requests
    where vehicle_id = vehicle_id_input
      and status in ('pending', 'approved', 'awaiting_payment', 'payment_pending', 'paid_pending_approval', 'confirmed', 'paid', 'active')
      and pickup_date is not null
      and return_date is not null
      and (pickup_date + coalesce(pickup_time, time '00:00')) < (return_date_input + coalesce(return_time_input, time '23:59:59'))
      and (return_date + coalesce(return_time, time '23:59:59')) > (pickup_date_input + coalesce(pickup_time_input, time '00:00'))
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
  where br.booking_number = public.normalize_booking_number(booking_number_input)
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
  where booking_requests.booking_number = public.normalize_booking_number(booking_number_input)
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

create or replace function public.can_manage_admin_data()
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
      and role in ('admin', 'manager')
  );
$$;

create or replace function public.can_manage_admin_users()
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
      and role = 'admin'
  );
$$;

alter table public.vehicles enable row level security;
alter table public.booking_requests enable row level security;
alter table public.booking_documents enable row level security;
alter table public.payments enable row level security;
alter table public.contact_requests enable row level security;
alter table public.booking_extension_requests enable row level security;
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
using (public.can_manage_admin_data())
with check (public.can_manage_admin_data());

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
);

drop policy if exists "Admins can read booking requests" on public.booking_requests;
create policy "Admins can read booking requests"
on public.booking_requests for select
to authenticated
using (public.is_active_admin());

drop policy if exists "Admins can update booking requests" on public.booking_requests;
create policy "Admins can update booking requests"
on public.booking_requests for update
to authenticated
using (public.can_manage_admin_data())
with check (public.can_manage_admin_data());

drop policy if exists "Public can create booking documents" on public.booking_documents;
create policy "Public can create booking documents"
on public.booking_documents for insert
to anon, authenticated
with check (
  booking_request_id is not null
  and document_type in ('driver_license', 'supporting_document', 'insurance', 'identity', 'other')
  and file_path like 'bookings/' || booking_request_id::text || '/%'
  and mime_type in ('image/jpeg', 'image/png', 'application/pdf')
  and size_bytes is not null
  and size_bytes > 0
  and size_bytes <= 10485760
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
using (public.can_manage_admin_data())
with check (public.can_manage_admin_data());

drop policy if exists "Admins can read payments" on public.payments;
create policy "Admins can read payments"
on public.payments for select
to authenticated
using (public.is_active_admin());

drop policy if exists "Admins can update payments" on public.payments;
create policy "Admins can update payments"
on public.payments for update
to authenticated
using (public.can_manage_admin_data())
with check (public.can_manage_admin_data());

drop policy if exists "Public can create new contact requests" on public.contact_requests;
create policy "Public can create new contact requests"
on public.contact_requests for insert
to anon, authenticated
with check (
  status = 'new'
  and nullif(trim(name), '') is not null
  and nullif(trim(email), '') is not null
  and nullif(trim(message), '') is not null
);

drop policy if exists "Admins can read contact requests" on public.contact_requests;
create policy "Admins can read contact requests"
on public.contact_requests for select
to authenticated
using (public.is_active_admin());

drop policy if exists "Admins can update contact requests" on public.contact_requests;
create policy "Admins can update contact requests"
on public.contact_requests for update
to authenticated
using (public.can_manage_admin_data())
with check (public.can_manage_admin_data());

drop policy if exists "Admins can read booking extension requests" on public.booking_extension_requests;
create policy "Admins can read booking extension requests"
on public.booking_extension_requests for select
to authenticated
using (public.is_active_admin());

drop policy if exists "Admins can update booking extension requests" on public.booking_extension_requests;
create policy "Admins can update booking extension requests"
on public.booking_extension_requests for update
to authenticated
using (public.can_manage_admin_data())
with check (public.can_manage_admin_data());

drop policy if exists "Admins can read admin users" on public.admin_users;
create policy "Admins can read admin users"
on public.admin_users for select
to authenticated
using (public.is_active_admin());

drop policy if exists "Admins can update admin users" on public.admin_users;
create policy "Admins can update admin users"
on public.admin_users for update
to authenticated
using (public.can_manage_admin_users())
with check (public.can_manage_admin_users());

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
grant select, update on public.booking_extension_requests to authenticated;
grant select, update on public.admin_users to authenticated;
grant execute on function public.check_vehicle_availability(uuid, date, date, time, time) to anon, authenticated;
grant execute on function public.get_payment_checkout_summary(text, text) to anon, authenticated;
grant execute on function public.mark_booking_payment_pending(text, text) to anon, authenticated;

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
with check (
  bucket_id = 'booking-documents'
  and (storage.foldername(name))[1] = 'bookings'
);

drop policy if exists "Admins can read booking document files" on storage.objects;
create policy "Admins can read booking document files"
on storage.objects for select
to authenticated
using (bucket_id = 'booking-documents' and public.is_active_admin());

drop policy if exists "Admins can manage booking document files" on storage.objects;
create policy "Admins can manage booking document files"
on storage.objects for update
to authenticated
using (bucket_id = 'booking-documents' and public.can_manage_admin_data())
with check (bucket_id = 'booking-documents' and public.can_manage_admin_data());

alter table public.vehicles
add column if not exists title text;

alter table public.vehicles
add column if not exists short_description text;

alter table public.vehicles
add column if not exists full_description text;

alter table public.vehicles
add column if not exists tags text[] default '{}'::text[];

alter table public.vehicles
add column if not exists sort_order integer default 0;

alter table public.vehicles
add column if not exists public_visible boolean default true;

alter table public.vehicles
add column if not exists archived_at timestamptz;

create index if not exists vehicles_public_sort_idx
on public.vehicles (public_visible, status, sort_order, year desc);

drop policy if exists "Public can read available vehicles" on public.vehicles;
create policy "Public can read available vehicles"
on public.vehicles for select
to anon, authenticated
using (
  status = 'available'
  and coalesce(public_visible, true) = true
  and archived_at is null
);

create table if not exists public.delivery_location_hubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  lat numeric,
  lng numeric,
  active boolean default true,
  public_pickup_enabled boolean default true,
  public_return_enabled boolean default true,
  base_pickup_fee numeric default 0,
  base_return_fee numeric default 0,
  free_radius_miles numeric default 0,
  per_mile_fee numeric default 0,
  min_fee numeric,
  max_fee numeric,
  sort_order integer default 0,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.delivery_service_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area_type text default 'city',
  city text,
  state text,
  polygon_geojson jsonb,
  active boolean default true,
  pickup_base_fee numeric,
  return_base_fee numeric,
  per_mile_override numeric,
  free_radius_override numeric,
  min_fee numeric,
  max_fee numeric,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint delivery_service_areas_type_check check (area_type in ('city', 'polygon'))
);

create table if not exists public.delivery_pricing_settings (
  id boolean primary key default true,
  custom_delivery_enabled boolean default true,
  default_free_radius_miles numeric default 3,
  default_per_mile_fee numeric default 4,
  default_pickup_base_fee numeric default 20,
  default_return_base_fee numeric default 20,
  min_custom_delivery_fee numeric default 0,
  max_custom_delivery_fee numeric,
  one_way_surcharge_enabled boolean default true,
  one_way_threshold_miles numeric default 10,
  one_way_per_mile_fee numeric default 3,
  distance_method text default 'straight_line',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint delivery_pricing_settings_singleton check (id),
  constraint delivery_pricing_distance_method_check check (distance_method in ('straight_line', 'driving'))
);

insert into public.delivery_pricing_settings (id)
values (true)
on conflict (id) do nothing;

insert into public.delivery_location_hubs (
  name,
  address,
  lat,
  lng,
  active,
  public_pickup_enabled,
  public_return_enabled,
  base_pickup_fee,
  base_return_fee,
  free_radius_miles,
  per_mile_fee,
  min_fee,
  sort_order
)
values
  ('LAX Airport', '1 World Way, Los Angeles, CA', 33.9416, -118.4085, true, true, true, 0, 0, 0, 0, 0, 10),
  ('Glendale pickup', 'Glendale, CA', 34.1425, -118.2551, true, true, true, 0, 0, 3, 4, 0, 20)
on conflict do nothing;

alter table public.booking_requests
add column if not exists pickup_location_type text default 'hub';

alter table public.booking_requests
add column if not exists return_location_type text default 'same_as_pickup';

alter table public.booking_requests
add column if not exists pickup_location_hub_id uuid references public.delivery_location_hubs(id);

alter table public.booking_requests
add column if not exists return_location_hub_id uuid references public.delivery_location_hubs(id);

alter table public.booking_requests
add column if not exists pickup_custom_address text;

alter table public.booking_requests
add column if not exists return_custom_address text;

alter table public.booking_requests
add column if not exists pickup_lat numeric;

alter table public.booking_requests
add column if not exists pickup_lng numeric;

alter table public.booking_requests
add column if not exists return_lat numeric;

alter table public.booking_requests
add column if not exists return_lng numeric;

alter table public.booking_requests
add column if not exists total_location_fee numeric default 0;

alter table public.booking_requests
add column if not exists location_fee_breakdown jsonb default '{}'::jsonb;

drop function if exists public.get_payment_checkout_summary(text, text);
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
  pickup_location_type text,
  return_location_type text,
  total_location_fee numeric,
  location_fee_breakdown jsonb,
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
    coalesce(v.title, concat_ws(' ', v.year::text, v.color, v.make, v.model, v.trim)) as vehicle_name,
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
    br.pickup_location_type,
    br.return_location_type,
    coalesce(br.total_location_fee, 0) as total_location_fee,
    coalesce(br.location_fee_breakdown, '{}'::jsonb) as location_fee_breakdown,
    br.rental_days,
    br.daily_rate_snapshot as daily_rate,
    br.estimated_subtotal,
    coalesce(br.total_location_fee, 0) as taxes_fees,
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
  where br.booking_number = public.normalize_booking_number(booking_number_input)
    and br.payment_access_token = payment_access_token_input
  limit 1;
$$;

grant execute on function public.get_payment_checkout_summary(text, text) to anon, authenticated;

create or replace function public.distance_miles(
  lat1 numeric,
  lng1 numeric,
  lat2 numeric,
  lng2 numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else (
      3958.7613 * 2 * asin(
        least(1,
          sqrt(
            power(sin(radians((lat2::double precision - lat1::double precision) / 2)), 2)
            + cos(radians(lat1::double precision))
              * cos(radians(lat2::double precision))
              * power(sin(radians((lng2::double precision - lng1::double precision) / 2)), 2)
          )
        )
      )
    )::numeric
  end;
$$;

create or replace function public.apply_booking_location_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.delivery_pricing_settings%rowtype;
  pickup_hub public.delivery_location_hubs%rowtype;
  return_hub public.delivery_location_hubs%rowtype;
  pickup_zone public.delivery_service_areas%rowtype;
  return_zone public.delivery_service_areas%rowtype;
  pickup_distance numeric := null;
  return_distance numeric := null;
  one_way_distance numeric := null;
  pickup_fee numeric := 0;
  return_fee numeric := 0;
  one_way_fee numeric := 0;
  pickup_free_radius numeric := 0;
  return_free_radius numeric := 0;
  pickup_per_mile numeric := 0;
  return_per_mile numeric := 0;
  pickup_min numeric := null;
  pickup_max numeric := null;
  return_min numeric := null;
  return_max numeric := null;
begin
  select * into settings
  from public.delivery_pricing_settings
  where id = true
  limit 1;

  if settings.id is null then
    settings.custom_delivery_enabled := false;
    settings.default_free_radius_miles := 0;
    settings.default_per_mile_fee := 0;
    settings.default_pickup_base_fee := 0;
    settings.default_return_base_fee := 0;
    settings.min_custom_delivery_fee := 0;
    settings.one_way_surcharge_enabled := false;
    settings.one_way_threshold_miles := 0;
    settings.one_way_per_mile_fee := 0;
    settings.distance_method := 'straight_line';
  end if;

  new.pickup_location_type := coalesce(nullif(new.pickup_location_type, ''), 'hub');
  new.return_location_type := coalesce(nullif(new.return_location_type, ''), 'same_as_pickup');

  if new.pickup_location_type = 'custom' and settings.custom_delivery_enabled and new.pickup_lat is not null and new.pickup_lng is not null then
    select * into pickup_hub
    from public.delivery_location_hubs
    where active = true
      and lat is not null
      and lng is not null
    order by public.distance_miles(lat, lng, new.pickup_lat, new.pickup_lng) asc nulls last
    limit 1;

    select * into pickup_zone
    from public.delivery_service_areas
    where active = true
      and area_type = 'city'
      and city is not null
      and coalesce(new.pickup_custom_address, new.pickup_location, '') ilike '%' || city || '%'
    order by name
    limit 1;

    pickup_distance := public.distance_miles(pickup_hub.lat, pickup_hub.lng, new.pickup_lat, new.pickup_lng);
    pickup_free_radius := coalesce(pickup_zone.free_radius_override, pickup_hub.free_radius_miles, settings.default_free_radius_miles, 0);
    pickup_per_mile := coalesce(pickup_zone.per_mile_override, pickup_hub.per_mile_fee, settings.default_per_mile_fee, 0);
    pickup_min := coalesce(pickup_zone.min_fee, pickup_hub.min_fee, settings.min_custom_delivery_fee);
    pickup_max := coalesce(pickup_zone.max_fee, pickup_hub.max_fee, settings.max_custom_delivery_fee);
    pickup_fee := coalesce(pickup_zone.pickup_base_fee, settings.default_pickup_base_fee, 0)
      + greatest(0, coalesce(pickup_distance, 0) - pickup_free_radius) * pickup_per_mile;

    if pickup_min is not null then pickup_fee := greatest(pickup_fee, pickup_min); end if;
    if pickup_max is not null then pickup_fee := least(pickup_fee, pickup_max); end if;
  elsif new.pickup_location_type = 'hub' then
    select * into pickup_hub
    from public.delivery_location_hubs
    where active = true
      and (id = new.pickup_location_hub_id or lower(name) = lower(coalesce(new.pickup_location, '')))
    order by sort_order
    limit 1;
    pickup_fee := coalesce(pickup_hub.base_pickup_fee, 0);
  end if;

  if new.return_location_type = 'same_as_pickup' then
    new.return_custom_address := coalesce(new.return_custom_address, new.pickup_custom_address);
    new.return_lat := coalesce(new.return_lat, new.pickup_lat);
    new.return_lng := coalesce(new.return_lng, new.pickup_lng);
    if new.pickup_location_type = 'custom' and settings.custom_delivery_enabled and new.return_lat is not null and new.return_lng is not null then
      return_hub := pickup_hub;
      return_zone := pickup_zone;
      return_distance := pickup_distance;
      return_free_radius := coalesce(return_zone.free_radius_override, return_hub.free_radius_miles, settings.default_free_radius_miles, 0);
      return_per_mile := coalesce(return_zone.per_mile_override, return_hub.per_mile_fee, settings.default_per_mile_fee, 0);
      return_min := coalesce(return_zone.min_fee, return_hub.min_fee, settings.min_custom_delivery_fee);
      return_max := coalesce(return_zone.max_fee, return_hub.max_fee, settings.max_custom_delivery_fee);
      return_fee := coalesce(return_zone.return_base_fee, settings.default_return_base_fee, 0)
        + greatest(0, coalesce(return_distance, 0) - return_free_radius) * return_per_mile;
      if return_min is not null then return_fee := greatest(return_fee, return_min); end if;
      if return_max is not null then return_fee := least(return_fee, return_max); end if;
    end if;
  elsif new.return_location_type = 'custom' and settings.custom_delivery_enabled and new.return_lat is not null and new.return_lng is not null then
    select * into return_hub
    from public.delivery_location_hubs
    where active = true
      and lat is not null
      and lng is not null
    order by public.distance_miles(lat, lng, new.return_lat, new.return_lng) asc nulls last
    limit 1;

    select * into return_zone
    from public.delivery_service_areas
    where active = true
      and area_type = 'city'
      and city is not null
      and coalesce(new.return_custom_address, new.return_location, '') ilike '%' || city || '%'
    order by name
    limit 1;

    return_distance := public.distance_miles(return_hub.lat, return_hub.lng, new.return_lat, new.return_lng);
    return_free_radius := coalesce(return_zone.free_radius_override, return_hub.free_radius_miles, settings.default_free_radius_miles, 0);
    return_per_mile := coalesce(return_zone.per_mile_override, return_hub.per_mile_fee, settings.default_per_mile_fee, 0);
    return_min := coalesce(return_zone.min_fee, return_hub.min_fee, settings.min_custom_delivery_fee);
    return_max := coalesce(return_zone.max_fee, return_hub.max_fee, settings.max_custom_delivery_fee);
    return_fee := coalesce(return_zone.return_base_fee, settings.default_return_base_fee, 0)
      + greatest(0, coalesce(return_distance, 0) - return_free_radius) * return_per_mile;
    if return_min is not null then return_fee := greatest(return_fee, return_min); end if;
    if return_max is not null then return_fee := least(return_fee, return_max); end if;
  elsif new.return_location_type = 'hub' then
    select * into return_hub
    from public.delivery_location_hubs
    where active = true
      and (id = new.return_location_hub_id or lower(name) = lower(coalesce(new.return_location, '')))
    order by sort_order
    limit 1;
    return_fee := coalesce(return_hub.base_return_fee, 0);
  end if;

  if settings.one_way_surcharge_enabled
    and new.pickup_location_type = 'custom'
    and new.return_location_type = 'custom'
    and new.pickup_lat is not null
    and new.pickup_lng is not null
    and new.return_lat is not null
    and new.return_lng is not null then
    one_way_distance := public.distance_miles(new.pickup_lat, new.pickup_lng, new.return_lat, new.return_lng);
    if one_way_distance > coalesce(settings.one_way_threshold_miles, 0) then
      one_way_fee := (one_way_distance - coalesce(settings.one_way_threshold_miles, 0)) * coalesce(settings.one_way_per_mile_fee, 0);
    end if;
  end if;

  new.total_location_fee := round(coalesce(pickup_fee, 0) + coalesce(return_fee, 0) + coalesce(one_way_fee, 0), 2);
  new.location_fee_breakdown := jsonb_build_object(
    'pickupType', new.pickup_location_type,
    'returnType', new.return_location_type,
    'pickupAddress', new.pickup_custom_address,
    'pickupLat', new.pickup_lat,
    'pickupLng', new.pickup_lng,
    'returnAddress', new.return_custom_address,
    'returnLat', new.return_lat,
    'returnLng', new.return_lng,
    'pickupNearestHubId', pickup_hub.id,
    'returnNearestHubId', return_hub.id,
    'pickupNearestHubName', pickup_hub.name,
    'returnNearestHubName', return_hub.name,
    'pickupDistanceMiles', pickup_distance,
    'returnDistanceMiles', return_distance,
    'pickupZoneId', pickup_zone.id,
    'returnZoneId', return_zone.id,
    'pickupZoneName', pickup_zone.name,
    'returnZoneName', return_zone.name,
    'pickupDeliveryFee', round(coalesce(pickup_fee, 0), 2),
    'returnCollectionFee', round(coalesce(return_fee, 0), 2),
    'oneWayDistanceMiles', one_way_distance,
    'oneWayCustomSurcharge', round(coalesce(one_way_fee, 0), 2),
    'totalLocationFee', new.total_location_fee,
    'calculationMethod', coalesce(settings.distance_method, 'straight_line'),
    'calculatedAt', now()
  );

  if new.estimated_subtotal is not null or new.deposit_snapshot is not null then
    new.estimated_total := round(coalesce(new.estimated_subtotal, 0) + coalesce(new.deposit_snapshot, 0) + coalesce(new.total_location_fee, 0), 2);
  end if;

  return new;
end;
$$;

drop trigger if exists booking_requests_apply_location_fee on public.booking_requests;
create trigger booking_requests_apply_location_fee
before insert or update of
  pickup_location_type,
  return_location_type,
  pickup_location,
  return_location,
  pickup_custom_address,
  return_custom_address,
  pickup_lat,
  pickup_lng,
  return_lat,
  return_lng,
  estimated_subtotal,
  deposit_snapshot
on public.booking_requests
for each row execute function public.apply_booking_location_fee();

create or replace function public.preview_delivery_location_fee(
  pickup_type_input text,
  return_type_input text,
  pickup_address_input text,
  pickup_lat_input numeric,
  pickup_lng_input numeric,
  return_address_input text,
  return_lat_input numeric,
  return_lng_input numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.delivery_pricing_settings%rowtype;
  pickup_hub public.delivery_location_hubs%rowtype;
  return_hub public.delivery_location_hubs%rowtype;
  pickup_zone public.delivery_service_areas%rowtype;
  return_zone public.delivery_service_areas%rowtype;
  pickup_type text := coalesce(nullif(pickup_type_input, ''), 'hub');
  return_type text := coalesce(nullif(return_type_input, ''), 'same_as_pickup');
  pickup_distance numeric := null;
  return_distance numeric := null;
  one_way_distance numeric := null;
  pickup_fee numeric := 0;
  return_fee numeric := 0;
  one_way_fee numeric := 0;
  pickup_free_radius numeric := 0;
  return_free_radius numeric := 0;
  pickup_per_mile numeric := 0;
  return_per_mile numeric := 0;
  pickup_min numeric := null;
  pickup_max numeric := null;
  return_min numeric := null;
  return_max numeric := null;
  resolved_return_address text := return_address_input;
  resolved_return_lat numeric := return_lat_input;
  resolved_return_lng numeric := return_lng_input;
begin
  select * into settings
  from public.delivery_pricing_settings
  where id = true
  limit 1;

  if settings.id is null then
    settings.custom_delivery_enabled := false;
    settings.default_free_radius_miles := 0;
    settings.default_per_mile_fee := 0;
    settings.default_pickup_base_fee := 0;
    settings.default_return_base_fee := 0;
    settings.min_custom_delivery_fee := 0;
    settings.one_way_surcharge_enabled := false;
    settings.one_way_threshold_miles := 0;
    settings.one_way_per_mile_fee := 0;
    settings.distance_method := 'straight_line';
  end if;

  if pickup_type = 'custom' and settings.custom_delivery_enabled and pickup_lat_input is not null and pickup_lng_input is not null then
    select * into pickup_hub
    from public.delivery_location_hubs
    where active = true
      and lat is not null
      and lng is not null
    order by public.distance_miles(lat, lng, pickup_lat_input, pickup_lng_input) asc nulls last
    limit 1;

    select * into pickup_zone
    from public.delivery_service_areas
    where active = true
      and area_type = 'city'
      and city is not null
      and coalesce(pickup_address_input, '') ilike '%' || city || '%'
    order by name
    limit 1;

    pickup_distance := public.distance_miles(pickup_hub.lat, pickup_hub.lng, pickup_lat_input, pickup_lng_input);
    pickup_free_radius := coalesce(pickup_zone.free_radius_override, pickup_hub.free_radius_miles, settings.default_free_radius_miles, 0);
    pickup_per_mile := coalesce(pickup_zone.per_mile_override, pickup_hub.per_mile_fee, settings.default_per_mile_fee, 0);
    pickup_min := coalesce(pickup_zone.min_fee, pickup_hub.min_fee, settings.min_custom_delivery_fee);
    pickup_max := coalesce(pickup_zone.max_fee, pickup_hub.max_fee, settings.max_custom_delivery_fee);
    pickup_fee := coalesce(pickup_zone.pickup_base_fee, settings.default_pickup_base_fee, 0)
      + greatest(0, coalesce(pickup_distance, 0) - pickup_free_radius) * pickup_per_mile;

    if pickup_min is not null then pickup_fee := greatest(pickup_fee, pickup_min); end if;
    if pickup_max is not null then pickup_fee := least(pickup_fee, pickup_max); end if;
  elsif pickup_type = 'hub' then
    select * into pickup_hub
    from public.delivery_location_hubs
    where active = true
      and lower(name) = lower(coalesce(pickup_address_input, ''))
    order by sort_order
    limit 1;
    pickup_fee := coalesce(pickup_hub.base_pickup_fee, 0);
  end if;

  if return_type = 'same_as_pickup' then
    resolved_return_address := coalesce(resolved_return_address, pickup_address_input);
    resolved_return_lat := coalesce(resolved_return_lat, pickup_lat_input);
    resolved_return_lng := coalesce(resolved_return_lng, pickup_lng_input);
    if pickup_type = 'custom' and settings.custom_delivery_enabled and resolved_return_lat is not null and resolved_return_lng is not null then
      return_hub := pickup_hub;
      return_zone := pickup_zone;
      return_distance := pickup_distance;
      return_free_radius := coalesce(return_zone.free_radius_override, return_hub.free_radius_miles, settings.default_free_radius_miles, 0);
      return_per_mile := coalesce(return_zone.per_mile_override, return_hub.per_mile_fee, settings.default_per_mile_fee, 0);
      return_min := coalesce(return_zone.min_fee, return_hub.min_fee, settings.min_custom_delivery_fee);
      return_max := coalesce(return_zone.max_fee, return_hub.max_fee, settings.max_custom_delivery_fee);
      return_fee := coalesce(return_zone.return_base_fee, settings.default_return_base_fee, 0)
        + greatest(0, coalesce(return_distance, 0) - return_free_radius) * return_per_mile;
      if return_min is not null then return_fee := greatest(return_fee, return_min); end if;
      if return_max is not null then return_fee := least(return_fee, return_max); end if;
    end if;
  elsif return_type = 'custom' and settings.custom_delivery_enabled and return_lat_input is not null and return_lng_input is not null then
    select * into return_hub
    from public.delivery_location_hubs
    where active = true
      and lat is not null
      and lng is not null
    order by public.distance_miles(lat, lng, return_lat_input, return_lng_input) asc nulls last
    limit 1;

    select * into return_zone
    from public.delivery_service_areas
    where active = true
      and area_type = 'city'
      and city is not null
      and coalesce(return_address_input, '') ilike '%' || city || '%'
    order by name
    limit 1;

    return_distance := public.distance_miles(return_hub.lat, return_hub.lng, return_lat_input, return_lng_input);
    return_free_radius := coalesce(return_zone.free_radius_override, return_hub.free_radius_miles, settings.default_free_radius_miles, 0);
    return_per_mile := coalesce(return_zone.per_mile_override, return_hub.per_mile_fee, settings.default_per_mile_fee, 0);
    return_min := coalesce(return_zone.min_fee, return_hub.min_fee, settings.min_custom_delivery_fee);
    return_max := coalesce(return_zone.max_fee, return_hub.max_fee, settings.max_custom_delivery_fee);
    return_fee := coalesce(return_zone.return_base_fee, settings.default_return_base_fee, 0)
      + greatest(0, coalesce(return_distance, 0) - return_free_radius) * return_per_mile;
    if return_min is not null then return_fee := greatest(return_fee, return_min); end if;
    if return_max is not null then return_fee := least(return_fee, return_max); end if;
  elsif return_type = 'hub' then
    select * into return_hub
    from public.delivery_location_hubs
    where active = true
      and lower(name) = lower(coalesce(return_address_input, ''))
    order by sort_order
    limit 1;
    return_fee := coalesce(return_hub.base_return_fee, 0);
  end if;

  if settings.one_way_surcharge_enabled
    and pickup_type = 'custom'
    and return_type = 'custom'
    and pickup_lat_input is not null
    and pickup_lng_input is not null
    and return_lat_input is not null
    and return_lng_input is not null then
    one_way_distance := public.distance_miles(pickup_lat_input, pickup_lng_input, return_lat_input, return_lng_input);
    if one_way_distance > coalesce(settings.one_way_threshold_miles, 0) then
      one_way_fee := (one_way_distance - coalesce(settings.one_way_threshold_miles, 0)) * coalesce(settings.one_way_per_mile_fee, 0);
    end if;
  end if;

  return jsonb_build_object(
    'pickupType', pickup_type,
    'returnType', return_type,
    'pickupAddress', pickup_address_input,
    'pickupLat', pickup_lat_input,
    'pickupLng', pickup_lng_input,
    'returnAddress', resolved_return_address,
    'returnLat', resolved_return_lat,
    'returnLng', resolved_return_lng,
    'pickupNearestHubId', pickup_hub.id,
    'returnNearestHubId', return_hub.id,
    'pickupNearestHubName', pickup_hub.name,
    'returnNearestHubName', return_hub.name,
    'pickupDistanceMiles', pickup_distance,
    'returnDistanceMiles', return_distance,
    'pickupZoneId', pickup_zone.id,
    'returnZoneId', return_zone.id,
    'pickupZoneName', pickup_zone.name,
    'returnZoneName', return_zone.name,
    'pickupDeliveryFee', round(coalesce(pickup_fee, 0), 2),
    'returnCollectionFee', round(coalesce(return_fee, 0), 2),
    'oneWayDistanceMiles', one_way_distance,
    'oneWayCustomSurcharge', round(coalesce(one_way_fee, 0), 2),
    'totalLocationFee', round(coalesce(pickup_fee, 0) + coalesce(return_fee, 0) + coalesce(one_way_fee, 0), 2),
    'calculationMethod', coalesce(settings.distance_method, 'straight_line'),
    'calculatedAt', now()
  );
end;
$$;

drop trigger if exists delivery_location_hubs_set_updated_at on public.delivery_location_hubs;
create trigger delivery_location_hubs_set_updated_at
before update on public.delivery_location_hubs
for each row execute function public.set_updated_at();

drop trigger if exists delivery_service_areas_set_updated_at on public.delivery_service_areas;
create trigger delivery_service_areas_set_updated_at
before update on public.delivery_service_areas
for each row execute function public.set_updated_at();

drop trigger if exists delivery_pricing_settings_set_updated_at on public.delivery_pricing_settings;
create trigger delivery_pricing_settings_set_updated_at
before update on public.delivery_pricing_settings
for each row execute function public.set_updated_at();

alter table public.delivery_location_hubs enable row level security;
alter table public.delivery_service_areas enable row level security;
alter table public.delivery_pricing_settings enable row level security;

drop policy if exists "Public can read active delivery hubs" on public.delivery_location_hubs;
create policy "Public can read active delivery hubs"
on public.delivery_location_hubs for select
to anon, authenticated
using (active = true and (public_pickup_enabled = true or public_return_enabled = true));

drop policy if exists "Admins can manage delivery hubs" on public.delivery_location_hubs;
create policy "Admins can manage delivery hubs"
on public.delivery_location_hubs for all
to authenticated
using (public.can_manage_admin_data())
with check (public.can_manage_admin_data());

drop policy if exists "Public can read active service areas" on public.delivery_service_areas;
create policy "Public can read active service areas"
on public.delivery_service_areas for select
to anon, authenticated
using (active = true);

drop policy if exists "Admins can manage delivery service areas" on public.delivery_service_areas;
create policy "Admins can manage delivery service areas"
on public.delivery_service_areas for all
to authenticated
using (public.can_manage_admin_data())
with check (public.can_manage_admin_data());

drop policy if exists "Public can read delivery pricing settings" on public.delivery_pricing_settings;
create policy "Public can read delivery pricing settings"
on public.delivery_pricing_settings for select
to anon, authenticated
using (true);

drop policy if exists "Admins can manage delivery pricing settings" on public.delivery_pricing_settings;
create policy "Admins can manage delivery pricing settings"
on public.delivery_pricing_settings for all
to authenticated
using (public.can_manage_admin_data())
with check (public.can_manage_admin_data());

drop policy if exists "Admins can insert vehicles" on public.vehicles;
create policy "Admins can insert vehicles"
on public.vehicles for insert
to authenticated
with check (public.can_manage_admin_data());

grant select, insert, update on public.delivery_location_hubs to authenticated;
grant select, insert, update on public.delivery_service_areas to authenticated;
grant select, insert, update on public.delivery_pricing_settings to authenticated;
grant select on public.delivery_location_hubs to anon;
grant select on public.delivery_service_areas to anon;
grant select on public.delivery_pricing_settings to anon;
grant insert on public.vehicles to authenticated;
grant execute on function public.preview_delivery_location_fee(text, text, text, numeric, numeric, text, numeric, numeric) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-images',
  'vehicle-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read vehicle image files" on storage.objects;
create policy "Public can read vehicle image files"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'vehicle-images');

drop policy if exists "Admins can upload vehicle image files" on storage.objects;
create policy "Admins can upload vehicle image files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'vehicle-images'
  and public.can_manage_admin_data()
);

drop policy if exists "Admins can delete vehicle image files" on storage.objects;
create policy "Admins can delete vehicle image files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'vehicle-images'
  and public.can_manage_admin_data()
);
