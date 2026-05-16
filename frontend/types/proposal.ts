export type ProposalEnvelopeType = "ELIGIBILITY" | "TECHNICAL" | "FINANCIAL" | "SUPPORTING_DOCUMENTS" | "TENDER_SECURITY";

export type ProposalEnvelope = {
  id: string;
  proposalPackageId: string;
  envelopeType: ProposalEnvelopeType;
  encryptedFileHash: string;
  envelopeManifestHash: string;
  encryptionAlgorithm: string;
  keyId?: string | null;
  storageReference?: string | null;
  ipfsCid?: string | null;
  txHash?: string | null;
  blockchainStatus?: string | null;
  createdAt: string;
  updatedAt?: string;
  fileReferences?: Array<{
    id: string;
    storageProvider: string;
    storageKey: string;
    encryptedFileHash: string;
    contentType: string;
    byteSize: number;
    originalFilename?: string | null;
    encryptionAlgorithm: string;
    createdAt: string;
  }>;
  keyReleaseRequests?: KeyReleaseRequest[];
};

export type ProposalPackage = {
  id: string;
  tenderId: string;
  vendorEmployeeHash: string;
  packageHash: string;
  status: string;
  submittedAt?: string | null;
  txHash?: string | null;
  blockchainStatus?: string | null;
  createdAt: string;
  updatedAt: string;
  envelopes?: ProposalEnvelope[];
  vendorStakeholder?: {
    id: string;
    displayName: string;
    organization?: string;
  } | null;
};

export type KeyReleaseRequest = {
  id: string;
  tenderId: string;
  proposalEnvelopeId: string;
  requesterEmployeeHash: string;
  requesterRole: string;
  requestedTenderState: string;
  status: string;
  rejectionReason?: string | null;
  keyMaterialReference?: string | null;
  releasedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
};

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
