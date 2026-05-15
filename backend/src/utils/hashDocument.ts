import path from "node:path";
import { createHash } from "node:crypto";
import { ValidationError } from "./errors.js";

export const MAX_PDF_UPLOAD_BYTES = 10 * 1024 * 1024;
const pdfMagic = Buffer.from("%PDF-");

export type UploadedPdfFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

export type HashedPdfDocument = {
  buffer: Buffer;
  documentHash: string;
  sanitizedFilename: string;
  byteLength: number;
  mimeType: "application/pdf";
};

export function sanitizeFilename(filename: string | undefined): string {
  const baseName = path.basename(filename ?? "document.pdf");
  const cleaned = baseName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 120);

  return cleaned && cleaned !== "." && cleaned !== ".." ? cleaned : "document.pdf";
}

export function hashDocumentBuffer(buffer: Buffer): string {
  return `0x${createHash("sha256").update(buffer).digest("hex")}`;
}

export function validateAndHashPdfDocument(file: UploadedPdfFile | undefined | null): HashedPdfDocument {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer)) {
    throw new ValidationError("A PDF document upload is required.", {
      field: "document"
    });
  }

  const sanitizedFilename = sanitizeFilename(file.originalname);
  const byteLength = file.size ?? file.buffer.byteLength;

  if (byteLength <= 0) {
    throw new ValidationError("Uploaded PDF document cannot be empty.", {
      field: "document"
    });
  }

  if (byteLength > MAX_PDF_UPLOAD_BYTES) {
    throw new ValidationError("Uploaded PDF document exceeds the 10MB limit.", {
      field: "document",
      maxBytes: MAX_PDF_UPLOAD_BYTES
    });
  }

  if (file.mimetype !== "application/pdf") {
    throw new ValidationError("Only PDF documents are accepted.", {
      field: "document",
      expectedMimeType: "application/pdf"
    });
  }

  if (path.extname(sanitizedFilename).toLowerCase() !== ".pdf") {
    throw new ValidationError("Uploaded document must use a .pdf filename.", {
      field: "document"
    });
  }

  if (!file.buffer.subarray(0, pdfMagic.length).equals(pdfMagic)) {
    throw new ValidationError("Uploaded document is not a valid PDF file.", {
      field: "document"
    });
  }

  return {
    buffer: file.buffer,
    documentHash: hashDocumentBuffer(file.buffer),
    sanitizedFilename,
    byteLength,
    mimeType: "application/pdf"
  };
}
