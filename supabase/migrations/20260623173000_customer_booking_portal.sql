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

alter table public.contact_requests
add column if not exists booking_request_id uuid references public.booking_requests(id) on delete set null;

alter table public.contact_requests
add column if not exists trip_id text;

alter table public.contact_requests
add column if not exists preferred_contact_method text;

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

create index if not exists contact_requests_booking_request_idx
on public.contact_requests (booking_request_id, created_at desc);

create index if not exists contact_requests_trip_id_idx
on public.contact_requests (trip_id);

create index if not exists booking_extension_requests_booking_idx
on public.booking_extension_requests (booking_request_id, created_at desc);

create index if not exists booking_extension_requests_trip_id_idx
on public.booking_extension_requests (trip_id);

alter table public.booking_extension_requests enable row level security;

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

grant select, update on public.booking_extension_requests to authenticated;
