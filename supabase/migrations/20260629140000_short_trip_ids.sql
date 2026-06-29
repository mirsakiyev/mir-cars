create extension if not exists "pgcrypto";

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

    if not exists (
      select 1
      from public.booking_requests
      where booking_number = candidate
    ) then
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

do $$
begin
  if not exists (
    select 1
    from pg_index idx
    join pg_class table_class on table_class.oid = idx.indrelid
    join pg_namespace namespace on namespace.oid = table_class.relnamespace
    where namespace.nspname = 'public'
      and table_class.relname = 'booking_requests'
      and idx.indisunique
      and pg_get_indexdef(idx.indexrelid) like '%(booking_number)%'
  ) then
    create unique index booking_requests_booking_number_unique_idx
    on public.booking_requests (booking_number);
  end if;
end;
$$;
