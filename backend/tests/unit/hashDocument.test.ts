import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/utils/errors.js";
import { hashDocumentBuffer, sanitizeFilename, validateAndHashPdfDocument } from "../../src/utils/hashDocument.js";

const pdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");

describe("document hashing utilities", () => {
  it("sanitizes filenames and computes server-side SHA256 document hashes", () => {
    const result = validateAndHashPdfDocument({
      originalname: "../Tender Final (signed).pdf",
      mimetype: "application/pdf",
      size: pdfBuffer.byteLength,
      buffer: pdfBuffer
    });

    expect(result).toMatchObject({
      documentHash: hashDocumentBuffer(pdfBuffer),
      sanitizedFilename: "Tender_Final_signed_.pdf",
      byteLength: pdfBuffer.byteLength,
      mimeType: "application/pdf"
    });
    expect(result.sanitizedFilename).not.toContain("..");
  });

  it("rejects non-PDF upload metadata and content", () => {
    const invalidUpload = {
      originalname: "invoice.txt",
      mimetype: "text/plain",
      size: 11,
      buffer: Buffer.from("hello world")
    };

    expect(() => validateAndHashPdfDocument(invalidUpload)).toThrow(ValidationError);
  });

  it("keeps sanitized filenames bounded and filesystem-neutral", () => {
    expect(sanitizeFilename("..\\..\\a/b:c*d?e<f>g|.pdf")).toBe("b_c_d_e_f_g_.pdf");
  });
});
