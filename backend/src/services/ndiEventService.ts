import { ValidationError } from "../utils/errors.js";

export type NormalizedNdiProof = {
  threadId: string;
  verificationResult: string;
  holderDID: string;
  attributes: {
    employmentId: string;
    employer: string;
    position: string;
    employmentType: string;
  };
};

function readAttr(source: Record<string, unknown>, key: string): string {
  const value = source[key];

  if (Array.isArray(value)) {
    return readAttr({ value: value[0] }, "value");
  }

  if (typeof value === "object" && value) {
    const objectValue = value as { value?: unknown; raw?: unknown };
    return String(objectValue.value ?? objectValue.raw ?? "");
  }

  return String(value ?? "");
}

export function normalizeNdiProofEvent(payload: Record<string, unknown>): NormalizedNdiProof {
  const verificationResult = String(payload.verification_result ?? payload.verificationResult ?? "");

  if (verificationResult !== "ProofValidated") {
    throw new ValidationError("NDI proof was not validated.");
  }

  const revealed =
    (payload.revealedAttributes as Record<string, unknown> | undefined) ??
    ((payload.requested_presentation as Record<string, unknown> | undefined)?.revealed_attrs as
      | Record<string, unknown>
      | undefined) ??
    {};

  return {
    threadId: String(payload.proofRequestThreadId ?? payload.threadId ?? ""),
    verificationResult,
    holderDID: String(payload.holderDID ?? payload.holder_did ?? ""),
    attributes: {
      employmentId: readAttr(revealed, "Employment ID"),
      employer: readAttr(revealed, "Employer"),
      position: readAttr(revealed, "Position"),
      employmentType: readAttr(revealed, "Employment Type")
    }
  };
}
