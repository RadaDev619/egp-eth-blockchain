import { describe, expect, it } from "vitest";
import { encryptProposalFile } from "@/utils/proposalEncryption";

async function fileText(file: File) {
  return new TextDecoder().decode(await file.arrayBuffer());
}

describe("proposal encryption utility", () => {
  it("encrypts proposal files in the browser and returns hash commitments", async () => {
    const plaintext = "financial proposal amount BTN 12345";
    const file = new File([plaintext], "financial.pdf", { type: "application/pdf" });
    const encrypted = await encryptProposalFile(file, "FINANCIAL");

    expect(encrypted.algorithm).toBe("AES-GCM");
    expect(encrypted.encryptedFile.name).toBe("financial.pdf.enc");
    expect(encrypted.encryptedFile.type).toBe("application/octet-stream");
    expect(encrypted.encryptedFileHash).toMatch(/^0x[a-f0-9]{64}$/);
    expect(encrypted.envelopeManifestHash).toMatch(/^0x[a-f0-9]{64}$/);
    expect(encrypted.ivBase64.length).toBeGreaterThan(0);
    expect(encrypted.authTagBase64.length).toBeGreaterThan(0);
    expect("rawKeyBase64" in encrypted).toBe(false);
    expect(await fileText(encrypted.encryptedFile)).not.toContain(plaintext);
    expect(encrypted.byteSize).toBeGreaterThan(file.size);
  });

  it("rejects empty proposal files before encryption", async () => {
    await expect(encryptProposalFile(new File([], "empty.pdf", { type: "application/pdf" }), "TECHNICAL")).rejects.toThrow(
      "Proposal file cannot be empty"
    );
  });
});
