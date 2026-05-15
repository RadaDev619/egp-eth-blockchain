import { env } from "../config/env.js";
import { canonicalJson, sha256Hex } from "../utils/hash.js";
import { AppError } from "../utils/errors.js";

export type StoreDocumentInput = {
  buffer: Buffer;
  documentHash: string;
  sanitizedFilename: string;
  mimeType: "application/pdf";
  byteLength: number;
};

export type StoredDocumentEvidence = {
  ipfsCid: string;
  mode: "mock" | "pinata";
};

export class IpfsStorageError extends AppError {
  constructor(message = "Document evidence storage failed.", details?: unknown) {
    super(502, "IPFS_STORAGE_ERROR", message, details);
  }
}

function deterministicMockCid(input: StoreDocumentInput): string {
  const digest = sha256Hex(
    canonicalJson({
      documentHash: input.documentHash,
      filename: input.sanitizedFilename,
      byteLength: input.byteLength,
      mimeType: input.mimeType
    })
  );

  return `mock-cid-${digest.slice(0, 46)}`;
}

async function storeWithPinata(input: StoreDocumentInput): Promise<StoredDocumentEvidence> {
  if (!env.PINATA_JWT) {
    throw new IpfsStorageError("PINATA_JWT is required when IPFS_MODE=pinata.");
  }

  const formData = new FormData();
  const fileBlob = new Blob([input.buffer], { type: input.mimeType });
  formData.append("file", fileBlob, input.sanitizedFilename);

  const metadata = {
    name: input.sanitizedFilename,
    keyvalues: {
      documentHash: input.documentHash,
      byteLength: String(input.byteLength)
    }
  };
  formData.append("pinataMetadata", JSON.stringify(metadata));

  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.PINATA_JWT}`
    },
    body: formData
  });

  if (!response.ok) {
    throw new IpfsStorageError("Pinata rejected the document upload.", {
      status: response.status
    });
  }

  const payload = (await response.json()) as { IpfsHash?: string };
  if (!payload.IpfsHash) {
    throw new IpfsStorageError("Pinata response did not include an IPFS CID.");
  }

  return {
    ipfsCid: payload.IpfsHash,
    mode: "pinata"
  };
}

export async function storeDocumentEvidence(input: StoreDocumentInput): Promise<StoredDocumentEvidence> {
  if (env.IPFS_MODE === "pinata") {
    return storeWithPinata(input);
  }

  return {
    ipfsCid: deterministicMockCid(input),
    mode: "mock"
  };
}
