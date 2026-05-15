import type { Role } from "./auth";
import type { Approval, Bid, BlockchainStatus, ProcurementTransition, Tender, TenderState, TenderVersion } from "./procurement";

export type AuditStatus =
  | "SUCCESS"
  | "BLOCKED"
  | "FAILED"
  | "PENDING_CHAIN_CONFIRMATION"
  | "CHAIN_CONFIRMED"
  | "CHAIN_FAILED"
  | "MOCK_CHAIN_CONFIRMED";

export type AuditEvent = {
  id: string;
  action: string;
  status: AuditStatus;
  actorRole?: Role | null;
  employeeHash?: string | null;
  actorEmployeeHash?: string | null;
  actorEmployer?: string | null;
  actorPosition?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  tenderId?: string | null;
  fromState?: TenderState | null;
  toState?: TenderState | null;
  permissionChecked?: string | null;
  permissionResult?: string | null;
  transitionAllowed?: boolean | null;
  rejectionReason?: string | null;
  documentHash?: string | null;
  ipfsCid?: string | null;
  metadataHash?: string | null;
  txHash?: string | null;
  blockchainStatus?: BlockchainStatus | null;
  blockNumber?: number | null;
  chainId?: number | null;
  contractAddress?: string | null;
  relayerAddress?: string | null;
  route?: string | null;
  httpMethod?: string | null;
  requestId?: string | null;
  timestamp: string;
  createdAt: string;
};

export type BlockchainTransaction = {
  id: string;
  txHash?: string | null;
  network: string;
  chainId?: number | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  tenderId?: string | null;
  contractAddress?: string | null;
  relayerAddress?: string | null;
  status: BlockchainStatus;
  blockNumber?: number | null;
  errorMessage?: string | null;
  explorerUrl?: string | null;
  createdAt: string;
  confirmedAt?: string | null;
};

export type AuditLogsResponse = {
  timeline: AuditEvent[];
  logs: AuditEvent[];
};

export type TenderAuditTimelineResponse = {
  tender: Tender;
  versions: TenderVersion[];
  bids: Bid[];
  approvals: Approval[];
  transitions: ProcurementTransition[];
  blockchainTransactions: BlockchainTransaction[];
  timeline: AuditEvent[];
};

export type AuditTransactionProofResponse = {
  txHash: string;
  blockchainTransaction?: BlockchainTransaction | null;
  explorerUrl?: string | null;
  timeline: AuditEvent[];
};

export type AuditLogFilters = {
  tenderId?: string;
  action?: string;
  status?: AuditStatus;
  actorRole?: Role;
  actorEmployeeHash?: string;
  txHash?: string;
  fromDate?: string;
  toDate?: string;
};

export type DocumentVerificationResponse = {
  verified: boolean;
  tamperingDetected: boolean;
  tenderId: string;
  tenderVersionId: string;
  versionNumber: number;
  expectedDocumentHash: string;
  uploadedDocumentHash: string;
  ipfsCid?: string | null;
  txHash?: string | null;
  blockchainStatus?: BlockchainStatus | "FAILED" | null;
};

export type VerifyDocumentInput = {
  tenderId: string;
  versionNumber?: number;
  tenderVersionId?: string;
  document: File;
};

export type PublicAuditProofType =
  | "TENDER_MANIFEST"
  | "PROPOSAL_PACKAGE"
  | "ENVELOPE_COMMITMENT"
  | "KEY_RELEASE"
  | "EVALUATION_REPORT"
  | "AWARD_RECOMMENDATION"
  | "AWARD_APPROVAL"
  | "CONTRACT_HASH"
  | "TAMPERING_DETECTED";

export type PublicTenderSummary = {
  id: string;
  tenderCode: string;
  agency: string;
  currentState: TenderState;
  createdAt: string;
  updatedAt: string;
  proofCount?: number;
};

export type PublicAuditProof = {
  id: string;
  tenderId: string;
  tender?: PublicTenderSummary | null;
  proofType: PublicAuditProofType;
  proofHash: string;
  sourceTxHash?: string | null;
  blockchainStatus?: BlockchainStatus | null;
  publicLabel: string;
  createdAt: string;
};

export type PublicAuditEvent = {
  id: string;
  source: "PUBLIC_PROOF" | "AUDIT_LOG";
  tenderId?: string | null;
  action: string;
  status: AuditStatus;
  actorRole?: Role | null;
  fromState?: TenderState | string | null;
  toState?: TenderState | string | null;
  rejectionReason?: string | null;
  documentHash?: string | null;
  metadataHash?: string | null;
  txHash?: string | null;
  blockchainStatus?: BlockchainStatus | null;
  blockNumber?: number | null;
  chainId?: number | null;
  publicLabel?: string | null;
  timestamp: string;
  createdAt: string;
};

export type PublicAuditOverviewResponse = {
  tenders: PublicTenderSummary[];
  proofs: PublicAuditProof[];
  timeline: PublicAuditEvent[];
};

export type PublicTenderAuditResponse = {
  tender: PublicTenderSummary;
  proofs: PublicAuditProof[];
  blockchainTransactions: BlockchainTransaction[];
  timeline: PublicAuditEvent[];
};

export type PublicTransactionAuditResponse = {
  txHash: string;
  blockchainTransaction?: BlockchainTransaction | null;
  proofs: PublicAuditProof[];
  timeline: PublicAuditEvent[];
};

export type PublicAuditFilters = {
  tenderId?: string;
  proofType?: PublicAuditProofType;
  txHash?: string;
};
