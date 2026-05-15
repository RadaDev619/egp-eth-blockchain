export type Role =
  | "PROCUREMENT_OFFICER"
  | "VENDOR"
  | "EVALUATOR"
  | "FINANCE_OFFICER"
  | "AUDITOR";

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
  | "CANCEL_TENDER";

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
