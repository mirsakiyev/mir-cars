alter table public.contact_requests
add column if not exists request_type text default 'contact';

alter table public.contact_requests
drop constraint if exists contact_requests_request_type_check;

alter table public.contact_requests
add constraint contact_requests_request_type_check check (
  request_type is null or request_type in ('contact', 'lost_and_found')
);

create index if not exists contact_requests_type_created_idx
on public.contact_requests (request_type, created_at desc);
