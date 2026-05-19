import { getSupabaseClient, getSupabaseConfigError } from "./supabase-client.js";

async function requireClient() {
  const client = await getSupabaseClient();

  if (!client) {
    throw new Error(getSupabaseConfigError());
  }

  return client;
}

export async function createBookingRequest(payload) {
  const client = await requireClient();
  const { error } = await client.from("booking_requests").insert(payload);

  if (error) throw error;
}

function safeFileName(fileName) {
  return fileName
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export async function uploadBookingDocuments({ bookingId, bookingNumber, documents }) {
  const client = await requireClient();
  const uploadedDocuments = [];

  for (const document of documents) {
    const fileName = safeFileName(document.file.name);
    const filePath = `bookings/${bookingId}/${document.type}-${Date.now()}-${fileName}`;
    const { error: uploadError } = await client.storage.from("booking-documents").upload(filePath, document.file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (uploadError) throw uploadError;

    uploadedDocuments.push({
      booking_request_id: bookingId,
      booking_number: bookingNumber,
      document_type: document.type,
      file_name: document.file.name,
      file_path: filePath,
      mime_type: document.file.type || null,
      size_bytes: document.file.size || null,
    });
  }

  if (!uploadedDocuments.length) return;

  const { error } = await client.from("booking_documents").insert(uploadedDocuments);

  if (error) throw error;
}

export async function createContactRequest(payload) {
  const client = await requireClient();
  const { error } = await client.from("contact_requests").insert(payload);

  if (error) throw error;
}
