drop policy if exists "Public can create booking documents" on public.booking_documents;
create policy "Public can create booking documents"
on public.booking_documents for insert
to anon, authenticated
with check (
  booking_request_id is not null
  and document_type in ('driver_license', 'supporting_document', 'identity', 'other')
  and file_path like 'bookings/' || booking_request_id::text || '/%'
  and mime_type in ('image/jpeg', 'image/png', 'application/pdf')
  and size_bytes is not null
  and size_bytes > 0
  and size_bytes <= 10485760
);
