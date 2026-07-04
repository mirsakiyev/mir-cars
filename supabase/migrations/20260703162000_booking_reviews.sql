alter table public.booking_requests
drop constraint if exists booking_requests_status_check;

alter table public.booking_requests
add constraint booking_requests_status_check check (
  status in ('pending', 'approved', 'declined', 'cancelled', 'awaiting_payment', 'payment_pending', 'paid_pending_approval', 'confirmed', 'paid', 'active', 'completed', 'finalized', 'no_show', 'refunded')
);

alter table public.booking_requests
drop constraint if exists booking_requests_booking_status_check;

alter table public.booking_requests
add constraint booking_requests_booking_status_check check (
  booking_status is null
  or booking_status in ('pending', 'approved', 'declined', 'cancelled', 'awaiting_payment', 'payment_pending', 'paid_pending_approval', 'confirmed', 'paid', 'active', 'completed', 'finalized', 'no_show', 'refunded')
);

create table if not exists public.booking_reviews (
  id uuid primary key default gen_random_uuid(),
  review_id text not null unique default ('REV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  booking_request_id uuid not null references public.booking_requests(id) on delete cascade,
  trip_id text not null,
  customer_id text,
  customer_first_name text not null,
  customer_last_initial text,
  vehicle_name text not null,
  trip_start_date date,
  trip_end_date date,
  rating integer not null,
  note text,
  status text not null default 'visible',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint booking_reviews_rating_check check (rating between 1 and 5),
  constraint booking_reviews_status_check check (status in ('visible', 'hidden', 'removed')),
  constraint booking_reviews_one_per_booking unique (booking_request_id)
);

drop trigger if exists booking_reviews_set_updated_at on public.booking_reviews;
create trigger booking_reviews_set_updated_at
before update on public.booking_reviews
for each row execute function public.set_updated_at();

create index if not exists booking_reviews_public_idx
on public.booking_reviews (status, created_at desc)
where status = 'visible';

create index if not exists booking_reviews_trip_id_idx
on public.booking_reviews (trip_id);

alter table public.booking_reviews enable row level security;

drop policy if exists "Public can read visible booking reviews" on public.booking_reviews;
create policy "Public can read visible booking reviews"
on public.booking_reviews for select
to anon, authenticated
using (status = 'visible');

drop policy if exists "Admins can read booking reviews" on public.booking_reviews;
create policy "Admins can read booking reviews"
on public.booking_reviews for select
to authenticated
using (public.is_active_admin());

drop policy if exists "Admins can update booking reviews" on public.booking_reviews;
create policy "Admins can update booking reviews"
on public.booking_reviews for update
to authenticated
using (public.can_manage_admin_data())
with check (public.can_manage_admin_data());

drop policy if exists "Admins can delete booking reviews" on public.booking_reviews;
create policy "Admins can delete booking reviews"
on public.booking_reviews for delete
to authenticated
using (public.can_manage_admin_data());

grant select on public.booking_reviews to anon;
grant select, update, delete on public.booking_reviews to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update on table public.booking_reviews to service_role;
  end if;
end
$$;
