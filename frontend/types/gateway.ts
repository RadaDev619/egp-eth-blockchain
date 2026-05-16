import type { Role } from "./auth";
import type { BlockchainStatus, Tender, TenderState } from "./procurement";
import type { KeyReleaseRequest, ProposalEnvelope, ProposalEnvelopeType, ProposalPackage } from "./proposal";

export type TenderManifest = {
  id: string;
  tenderId: string;
  versionNumber: number;
  manifestHash: string;
  rulesHash?: string | null;
  criteriaHash?: string | null;
  documentsHash?: string | null;
  approvalPolicy: unknown;
  publicationThreshold: number;
  status: string;
  createdByEmployeeHash: string;
  createdByRole: Role;
  txHash?: string | null;
  blockchainStatus: BlockchainStatus;
  createdAt: string;
  updatedAt: string;
  publicationApprovals?: TenderPublicationApproval[];
};

export type TenderPublicationApproval = {
  id: string;
  manifestId: string;
  approverRole: Role;
  decision: string;
  signatureHash?: string | null;
  comments?: string | null;
  txHash?: string | null;
  blockchainStatus: BlockchainStatus;
  createdAt: string;
};

export type ManifestStatusResponse = {
  tender: Tender;
  manifest: TenderManifest | null;
  approvals?: TenderPublicationApproval[];
  approvalCount?: number;
  approvedCount?: number;
  publicationThreshold?: number | null;
  publicationReady?: boolean;
  published?: boolean;
};

export type CommitteeDashboard = {
  tender: Tender;
  currentUser: {
    role: Role;
    employeeHash: string;
    declarationStatus: string;
  };
  assignments: Array<{
    id: string;
    role: Role;
    status: string;
    stakeholder?: {
      displayName: string;
      organization: string;
    };
  }>;
  declarations: Array<{
    id: string;
    actorRole: Role;
    declarationStatus: string;
    declarationHash: string;
    txHash?: string | null;
    blockchainStatus?: BlockchainStatus;
    createdAt: string;
  }>;
  reports: EvaluationReport[];
  technicalEnvelopeCount: number;
};

export type EvaluationReport = {
  id: string;
  tenderId: string;
  reportHash: string;
  technicalScoreHash?: string | null;
  financialScoreHash?: string | null;
  status: string;
  submittedByRole: Role;
  txHash?: string | null;
  blockchainStatus?: BlockchainStatus;
  createdAt: string;
  updatedAt: string;
};

export type AwardRecommendation = {
  id: string;
  tenderId: string;
  evaluationReportId?: string | null;
  recommendedVendorStakeholderId?: string | null;
  recommendationHash: string;
  submittedByRole: Role;
  status: string;
  txHash?: string | null;
  blockchainStatus?: BlockchainStatus;
  approvals?: AwardApproval[];
  createdAt: string;
  updatedAt: string;
};

export type AwardApproval = {
  id: string;
  tenderId: string;
  awardRecommendationId: string;
  approverRole: Role;
  decision: string;
  signatureHash?: string | null;
  comments?: string | null;
  txHash?: string | null;
  blockchainStatus?: BlockchainStatus;
  createdAt: string;
};

export type AwardWorkspace = {
  tender: Tender;
  awardApprovalThreshold: number;
  recommendations: AwardRecommendation[];
  contractProofs: Array<{
    id: string;
    proofHash: string;
    publicLabel: string;
    sourceTxHash?: string | null;
    blockchainStatus?: BlockchainStatus | null;
    createdAt: string;
  }>;
};

export type SubmitProposalPackageInput = {
  tenderId: string;
  packageHash: string;
  envelopes: Array<{
    envelopeType: ProposalEnvelopeType;
    encryptedFileHash: string;
    envelopeManifestHash: string;
    storageReference: string;
    storageProvider?: string;
    contentType?: string;
    byteSize: number;
    originalFilename?: string;
    keyId?: string;
    encryptionAlgorithm?: string;
  }>;
};

export type FinancialWorkspace = {
  tender: Tender;
  envelopes: ProposalEnvelope[];
};

export type KeyReleaseWorkspace = {
  proposalPackages: ProposalPackage[];
  keyReleaseRequests: KeyReleaseRequest[];
};

export type LegacyEgpRecord = {
  id: string;
  sourceSystem: string;
  legacyRecordId: string;
  recordType: string;
  operation: string;
  operationalStatus: string;
  tenderId: string;
  encryptedFileReferenceId?: string | null;
  trustLayerTxHash?: string | null;
  blockchainStatus?: BlockchainStatus | null;
  metadataHash?: string | null;
  legacyCreatedAt?: string | null;
  createdAt: string;
};

export type KeyReleaseActionResult = {
  request?: KeyReleaseRequest;
  keyMaterialReference?: string | null;
  envelopeType?: string;
};

export type AwardApprovalResult = {
  approval: AwardApproval;
  approvedCount: number;
  threshold: number;
  thresholdMet: boolean;
  tenderState: TenderState;
};
