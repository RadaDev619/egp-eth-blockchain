import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { validateAndHashEncryptedProposalFile } from "../../src/utils/encryptedProposalFile.js";

function sha256(buffer: Buffer) {
  return `0x${createHash("sha256").update(buffer).digest("hex")}`;
}

describe("encryptedProposalFile", () => {
  it("hashes encrypted proposal bytes without returning file contents", () => {
    const encryptedBuffer = Buffer.from("encrypted random bytes that do not look like a document");
    const result = validateAndHashEncryptedProposalFile({
      originalname: "technical.pdf.enc",
      mimetype: "application/octet-stream",
      size: encryptedBuffer.byteLength,
      buffer: encryptedBuffer
    });

    expect(result).toEqual({
      encryptedFileHash: sha256(encryptedBuffer),
      sanitizedFilename: "technical.pdf.enc",
      byteLength: encryptedBuffer.byteLength,
      mimeType: "application/octet-stream"
    });
    expect(JSON.stringify(result)).not.toContain(encryptedBuffer.toString("utf8"));
  });

  it("rejects plaintext PDF uploads before proposal storage", () => {
    expect(() =>
      validateAndHashEncryptedProposalFile({
        originalname: "financial.pdf",
        mimetype: "application/pdf",
        size: 32,
        buffer: Buffer.from("%PDF-1.4\nplain proposal")
      })
    ).toThrow("Plain proposal documents must be encrypted before upload");
  });

  it("rejects plaintext documents even when MIME type is disguised", () => {
    expect(() =>
      validateAndHashEncryptedProposalFile({
        originalname: "financial.bin",
        mimetype: "application/octet-stream",
        size: 32,
        buffer: Buffer.from("%PDF-1.4\nplain proposal")
      })
    ).toThrow("Uploaded proposal appears to be plaintext");
  });
});
