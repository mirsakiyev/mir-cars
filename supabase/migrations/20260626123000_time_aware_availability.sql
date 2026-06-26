drop function if exists public.check_vehicle_availability(uuid, date, date);

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

grant execute on function public.check_vehicle_availability(uuid, date, date, time, time) to anon, authenticated;
