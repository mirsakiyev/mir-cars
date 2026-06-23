import { getSupabaseClient, getSupabaseConfigError } from "./supabase-client.js";

const allowedDocumentTypes = new Set(["driver_license", "supporting_document", "insurance", "identity", "other"]);
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "application/pdf"]);
const maxDocumentSizeBytes = 10 * 1024 * 1024;

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
  const safeName = fileName
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return safeName || "document";
}

function uniquePathPart() {
  if (crypto.randomUUID) return crypto.randomUUID();

  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return [...values].map((value) => value.toString(16).padStart(8, "0")).join("");
}

function validateBookingDocument(document) {
  if (!allowedDocumentTypes.has(document.type)) {
    throw new Error("Unsupported booking document type.");
  }

  if (!allowedMimeTypes.has(document.file.type)) {
    throw new Error("Booking documents must be JPG, PNG, or PDF files.");
  }

  if (document.file.size > maxDocumentSizeBytes) {
    throw new Error("Booking documents must be 10 MB or smaller.");
  }
}

export async function uploadBookingDocuments({ bookingId, bookingNumber, documents }) {
  const client = await requireClient();
  const uploadedDocuments = [];

  for (const document of documents) {
    validateBookingDocument(document);

    const fileName = safeFileName(document.file.name);
    const filePath = `bookings/${bookingId}/${document.type}-${uniquePathPart()}-${fileName}`;
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

  if (!error) return;

  if (payload.request_type && isMissingOptionalContactColumn(error)) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.request_type;

    const { error: fallbackError } = await client.from("contact_requests").insert(fallbackPayload);
    if (fallbackError) throw fallbackError;
    return;
  }

  throw error;
}

function isMissingOptionalContactColumn(error) {
  const message = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`;

  return /request_type|schema cache|column/i.test(message);
}
