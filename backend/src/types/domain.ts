import type { Role } from "@prisma/client";

export const permissions = {
  CREATE_TENDER: "CREATE_TENDER",
  UPLOAD_TENDER_DOCUMENT: "UPLOAD_TENDER_DOCUMENT",
  CREATE_TENDER_VERSION: "CREATE_TENDER_VERSION",
  SUBMIT_TENDER_AMENDMENT: "SUBMIT_TENDER_AMENDMENT",
  SUBMIT_BID: "SUBMIT_BID",
  VIEW_ELIGIBLE_TENDERS: "VIEW_ELIGIBLE_TENDERS",
  APPROVE_EVALUATION: "APPROVE_EVALUATION",
  REJECT_EVALUATION: "REJECT_EVALUATION",
  VIEW_ASSIGNED_TENDERS: "VIEW_ASSIGNED_TENDERS",
  APPROVE_PAYMENT: "APPROVE_PAYMENT",
  REJECT_PAYMENT: "REJECT_PAYMENT",
  VIEW_FINANCE_QUEUE: "VIEW_FINANCE_QUEUE",
  VIEW_AUDIT_LOGS: "VIEW_AUDIT_LOGS",
  VERIFY_PROCUREMENT_HISTORY: "VERIFY_PROCUREMENT_HISTORY",
  VERIFY_DOCUMENT: "VERIFY_DOCUMENT",
  VIEW_BLOCKCHAIN_PROOFS: "VIEW_BLOCKCHAIN_PROOFS",
  VIEW_ROLE_ACTION_HISTORY: "VIEW_ROLE_ACTION_HISTORY",
  COMPLETE_PROCUREMENT: "COMPLETE_PROCUREMENT",
  CANCEL_TENDER: "CANCEL_TENDER"
} as const;

export type Permission = (typeof permissions)[keyof typeof permissions];

export const rolePermissions: Record<Role, Permission[]> = {
  PROCUREMENT_OFFICER: [
    permissions.CREATE_TENDER,
    permissions.UPLOAD_TENDER_DOCUMENT,
    permissions.CREATE_TENDER_VERSION,
    permissions.SUBMIT_TENDER_AMENDMENT,
    permissions.CANCEL_TENDER
  ],
  VENDOR: [permissions.SUBMIT_BID, permissions.VIEW_ELIGIBLE_TENDERS],
  EVALUATOR: [
    permissions.APPROVE_EVALUATION,
    permissions.REJECT_EVALUATION,
    permissions.VIEW_ASSIGNED_TENDERS
  ],
  FINANCE_OFFICER: [
    permissions.APPROVE_PAYMENT,
    permissions.REJECT_PAYMENT,
    permissions.VIEW_FINANCE_QUEUE,
    permissions.COMPLETE_PROCUREMENT
  ],
  AUDITOR: [
    permissions.VIEW_AUDIT_LOGS,
    permissions.VERIFY_PROCUREMENT_HISTORY,
    permissions.VERIFY_DOCUMENT,
    permissions.VIEW_BLOCKCHAIN_PROOFS,
    permissions.VIEW_ROLE_ACTION_HISTORY
  ]
};

export type AuthenticatedUser = {
  userId: string;
  profileId: string;
  holderDID: string;
  employmentId: string;
  employeeHash: string;
  employer: string;
  position: string;
  employmentType: string;
  role: Role;
  permissions: Permission[];
};
