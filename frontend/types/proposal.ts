export type ProposalEnvelopeType = "ELIGIBILITY" | "TECHNICAL" | "FINANCIAL" | "SUPPORTING_DOCUMENTS" | "TENDER_SECURITY";

export type UploadEncryptedEnvelopeInput = {
  proposalPackageId: string;
  envelopeType: ProposalEnvelopeType;
  encryptedFile: File;
  envelopeManifestHash: string;
  keyId?: string;
  encryptionAlgorithm?: string;
  iv?: string;
  authTag?: string;
  ipfsCid?: string;
};
