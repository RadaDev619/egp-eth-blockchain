import type { Role } from "./auth";

export type TenderState =
  | "DRAFT"
  | "PUBLICATION_PENDING"
  | "PUBLISHED"
  | "CREATED"
  | "OPEN_FOR_BIDS"
  | "OPEN_FOR_PROPOSALS"
  | "BID_SUBMITTED"
  | "CLOSED"
  | "EVALUATION_PENDING"
  | "TECHNICAL_EVALUATION"
  | "FINANCIAL_EVALUATION"
  | "EVALUATION_APPROVED"
  | "AWARD_RECOMMENDED"
  | "AWARD_APPROVED"
  | "PAYMENT_PENDING"
  | "PAYMENT_APPROVED"
  | "CONTRACT_SIGNED"
  | "COMPLETED"
  | "ARCHIVED"
  | "CANCELLED";

export type BlockchainStatus = "NOT_SUBMITTED" | "PENDING" | "CONFIRMED" | "FAILED" | "MOCK_CONFIRMED";

export type TenderVersion = {
  id: string;
  tenderId: string;
  versionNumber: number;
  title: string;
  description: string;
  documentHash: string;
  ipfsCid?: string | null;
  changeReason?: string | null;
  createdByEmployeeHash: string;
  createdByRole: Role;
  txHash?: string | null;
  createdAt: string;
};

export type Bid = {
  id: string;
  tenderId: string;
  vendorEmployeeHash: string;
  vendorRole: Role;
  bidHash: string;
  bidDocumentHash?: string | null;
  ipfsCid?: string | null;
  txHash?: string | null;
  blockchainStatus?: BlockchainStatus;
  createdAt: string;
};

export type Approval = {
  id: string;
  tenderId: string;
  approvalType: "EVALUATION" | "PAYMENT";
  decision: "APPROVED" | "REJECTED";
  actorEmployeeHash: string;
  actorRole: Role;
  comments?: string | null;
  previousState: TenderState;
  newState: TenderState;
  txHash?: string | null;
  blockchainStatus?: BlockchainStatus;
  createdAt: string;
};

export type ProcurementTransition = {
  id: string;
  tenderId?: string | null;
  action: string;
  actorEmployeeHash?: string | null;
  actorRole?: Role | null;
  fromState?: TenderState | null;
  toState?: TenderState | null;
  allowed: boolean;
  rejectionReason?: string | null;
  txHash?: string | null;
  createdAt: string;
};

export type Tender = {
  id: string;
  tenderCode: string;
  agency: string;
  currentState: TenderState;
  currentVersion: number;
  createdByEmployeeHash: string;
  createdByRole: Role;
  createdTxHash?: string | null;
  createdAt: string;
  updatedAt: string;
  versions?: TenderVersion[];
  bids?: Bid[];
  approvals?: Approval[];
  transitions?: ProcurementTransition[];
};

export type CreateTenderInput = {
  tenderCode: string;
  agency: string;
  title: string;
  description: string;
  document?: File | null;
  documentHash?: string;
};

export type SubmitBidInput = {
  tenderId: string;
  bidHash: string;
};

export type ApprovalInput = {
  tenderId: string;
  comments?: string;
};
