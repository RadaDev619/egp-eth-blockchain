export type EncryptedProposalFile = {
  encryptedFile: File;
  encryptedFileHash: string;
  envelopeManifestHash: string;
  ivBase64: string;
  authTagBase64: string;
  algorithm: "AES-GCM";
  rawKeyBase64: string;
  byteSize: number;
};

const ivLengthBytes = 12;
const authTagLengthBytes = 16;

function cryptoProvider() {
  const provider = globalThis.crypto;

  if (!provider?.subtle) {
    throw new Error("WebCrypto AES-GCM is not available in this browser.");
  }

  return provider;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(bytes: ArrayBuffer | Uint8Array | string) {
  const input =
    typeof bytes === "string"
      ? new TextEncoder().encode(bytes)
      : bytes instanceof Uint8Array
        ? bytes
        : new Uint8Array(bytes);
  const digest = await cryptoProvider().subtle.digest("SHA-256", input as BufferSource);

  return `0x${bytesToHex(digest)}`;
}

function canonicalJson(value: Record<string, unknown>) {
  return JSON.stringify(
    Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = value[key];
        return accumulator;
      }, {})
  );
}

function encryptedFilename(filename: string) {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 100) || "proposal";
  return safeName.endsWith(".enc") ? safeName : `${safeName}.enc`;
}

export async function encryptProposalFile(file: File, envelopeType: string): Promise<EncryptedProposalFile> {
  if (!file.size) {
    throw new Error("Proposal file cannot be empty.");
  }

  const crypto = cryptoProvider();
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(ivLengthBytes));
  const plaintext = new Uint8Array(await file.arrayBuffer());
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, plaintext as BufferSource)
  );
  const authTag = encrypted.slice(Math.max(0, encrypted.byteLength - authTagLengthBytes));
  const encryptedFileHash = await sha256Hex(encrypted);
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  const ivBase64 = bytesToBase64(iv);
  const authTagBase64 = bytesToBase64(authTag);
  const envelopeManifestHash = await sha256Hex(
    canonicalJson({
      algorithm: "AES-GCM",
      authTagBase64,
      encryptedFileHash,
      envelopeType,
      originalFilename: file.name,
      ivBase64
    })
  );

  return {
    encryptedFile: new File([encrypted], encryptedFilename(file.name), { type: "application/octet-stream" }),
    encryptedFileHash,
    envelopeManifestHash,
    ivBase64,
    authTagBase64,
    algorithm: "AES-GCM",
    rawKeyBase64: bytesToBase64(rawKey),
    byteSize: encrypted.byteLength
  };
}
