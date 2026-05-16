export type Role =
  | "PROCUREMENT_OFFICER"
  | "VENDOR"
  | "EVALUATOR"
  | "FINANCE_OFFICER"
  | "AUDITOR"
  | "TEC_MEMBER"
  | "TEC_CHAIR"
  | "APPROVING_OFFICER"
  | "FINANCIAL_INSTITUTION_OFFICER";

export type Permission =
  | "CREATE_TENDER"
  | "UPLOAD_TENDER_DOCUMENT"
  | "CREATE_TENDER_VERSION"
  | "SUBMIT_TENDER_AMENDMENT"
  | "SUBMIT_BID"
  | "VIEW_ELIGIBLE_TENDERS"
  | "APPROVE_EVALUATION"
  | "REJECT_EVALUATION"
  | "VIEW_ASSIGNED_TENDERS"
  | "APPROVE_PAYMENT"
  | "REJECT_PAYMENT"
  | "VIEW_FINANCE_QUEUE"
  | "VIEW_AUDIT_LOGS"
  | "VERIFY_PROCUREMENT_HISTORY"
  | "VERIFY_DOCUMENT"
  | "VIEW_BLOCKCHAIN_PROOFS"
  | "VIEW_ROLE_ACTION_HISTORY"
  | "COMPLETE_PROCUREMENT"
  | "CANCEL_TENDER"
  | "MANAGE_TENDER_ASSIGNMENTS"
  | "CREATE_TENDER_MANIFEST"
  | "REQUEST_PUBLICATION_APPROVAL"
  | "APPROVE_TENDER_PUBLICATION"
  | "SUBMIT_PROPOSAL_PACKAGE"
  | "COMMIT_PROPOSAL_ENVELOPE"
  | "CLOSE_TENDER"
  | "REQUEST_KEY_RELEASE"
  | "RELEASE_ENVELOPE_KEY"
  | "DECLARE_CONFLICT_OF_INTEREST"
  | "SUBMIT_EVALUATION_REPORT"
  | "SUBMIT_AWARD_RECOMMENDATION"
  | "APPROVE_AWARD"
  | "COMMIT_CONTRACT_HASH"
  | "ARCHIVE_TENDER"
  | "MANAGE_LEGACY_EGP_SIMULATOR"
  | "VIEW_PUBLIC_AUDIT_PROOFS";

export type DemoNdiProfile = {
  employmentId: string;
  employer: string;
  position: string;
  employmentType: string;
  role: Role;
};

export type AuthenticatedUser = {
  userId: string;
  holderDID: string;
  employmentId: string;
  employeeHash: string;
  employer: string;
  position: string;
  employmentType: string;
  role: Role;
  permissions: Permission[];
};

export type NDIStartResponse = {
  mode: "mock" | "staging";
  proofRequestThreadId: string;
  threadId: string;
  proofRequestURL: string;
  proofRequestUrl: string;
  deepLinkURL: string;
  deepLinkUrl: string;
  qrData: string;
  requestedAttributes: string[];
  demoProfiles: DemoNdiProfile[];
};

export type LoginResponse = {
  token: string;
  expiresAt: string;
  proof: {
    proofRequestThreadId: string;
    verificationResult: string;
    status: string;
    requestedAttributes: string[];
    revealedAttributeNames: string[];
  };
  user: AuthenticatedUser;
  role: Role;
  permissions: Permission[];
  employeeHash: string;
};
