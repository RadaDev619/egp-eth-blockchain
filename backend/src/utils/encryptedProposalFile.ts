import { createHash } from "node:crypto";
import path from "node:path";
import { sanitizeFilename } from "./hashDocument.js";
import { ValidationError } from "./errors.js";

export const MAX_ENCRYPTED_PROPOSAL_UPLOAD_BYTES = 25 * 1024 * 1024;

const pdfMagic = Buffer.from("%PDF-");
const zipMagic = Buffer.from("PK\u0003\u0004");

export type UploadedEncryptedProposalFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

export type HashedEncryptedProposalFile = {
  encryptedFileHash: string;
  sanitizedFilename: string;
  byteLength: number;
  mimeType: string;
};

function hashBuffer(buffer: Buffer) {
  return `0x${createHash("sha256").update(buffer).digest("hex")}`;
}

function looksLikePlainDocument(buffer: Buffer) {
  return buffer.subarray(0, pdfMagic.length).equals(pdfMagic) || buffer.subarray(0, zipMagic.length).equals(zipMagic);
}

export function validateAndHashEncryptedProposalFile(
  file: UploadedEncryptedProposalFile | undefined | null
): HashedEncryptedProposalFile {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer)) {
    throw new ValidationError("An encrypted proposal file upload is required.", {
      field: "encryptedFile"
    });
  }

  const sanitizedFilename = sanitizeFilename(file.originalname ?? "proposal.enc");
  const byteLength = file.size ?? file.buffer.byteLength;

  if (byteLength <= 0) {
    throw new ValidationError("Encrypted proposal file cannot be empty.", {
      field: "encryptedFile"
    });
  }

  if (byteLength > MAX_ENCRYPTED_PROPOSAL_UPLOAD_BYTES) {
    throw new ValidationError("Encrypted proposal file exceeds the 25MB limit.", {
      field: "encryptedFile",
      maxBytes: MAX_ENCRYPTED_PROPOSAL_UPLOAD_BYTES
    });
  }

  if (file.mimetype === "application/pdf" || path.extname(sanitizedFilename).toLowerCase() === ".pdf") {
    throw new ValidationError("Plain proposal documents must be encrypted before upload.", {
      field: "encryptedFile"
    });
  }

  if (looksLikePlainDocument(file.buffer)) {
    throw new ValidationError("Uploaded proposal appears to be plaintext. Encrypt the file before upload.", {
      field: "encryptedFile"
    });
  }

  return {
    encryptedFileHash: hashBuffer(file.buffer),
    sanitizedFilename,
    byteLength,
    mimeType: file.mimetype || "application/octet-stream"
  };
}
