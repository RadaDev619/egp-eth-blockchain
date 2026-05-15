import type { Role } from "@prisma/client";
import { permissions, type Permission } from "../types/domain.js";
import { AuthorizationError, InvalidTransitionError, ValidationError } from "../utils/errors.js";
import { hasPermission } from "./rbacService.js";

export const TenderState = {
  DRAFT: "DRAFT",
  PUBLICATION_PENDING: "PUBLICATION_PENDING",
  PUBLISHED: "PUBLISHED",
  CREATED: "CREATED",
  OPEN_FOR_BIDS: "OPEN_FOR_BIDS",
  OPEN_FOR_PROPOSALS: "OPEN_FOR_PROPOSALS",
  BID_SUBMITTED: "BID_SUBMITTED",
  CLOSED: "CLOSED",
  EVALUATION_PENDING: "EVALUATION_PENDING",
  TECHNICAL_EVALUATION: "TECHNICAL_EVALUATION",
  FINANCIAL_EVALUATION: "FINANCIAL_EVALUATION",
  EVALUATION_APPROVED: "EVALUATION_APPROVED",
  AWARD_RECOMMENDED: "AWARD_RECOMMENDED",
  AWARD_APPROVED: "AWARD_APPROVED",
  PAYMENT_PENDING: "PAYMENT_PENDING",
  PAYMENT_APPROVED: "PAYMENT_APPROVED",
  CONTRACT_SIGNED: "CONTRACT_SIGNED",
  COMPLETED: "COMPLETED",
  ARCHIVED: "ARCHIVED",
  CANCELLED: "CANCELLED"
} as const;

export type TenderStateValue = (typeof TenderState)[keyof typeof TenderState];

export const ProcurementAction = {
  CREATE_TENDER: "CREATE_TENDER",
  CREATE_TENDER_MANIFEST: "CREATE_TENDER_MANIFEST",
  REQUEST_PUBLICATION_APPROVAL: "REQUEST_PUBLICATION_APPROVAL",
  APPROVE_TENDER_PUBLICATION: "APPROVE_TENDER_PUBLICATION",
  SUBMIT_BID: "SUBMIT_BID",
  SUBMIT_PROPOSAL_PACKAGE: "SUBMIT_PROPOSAL_PACKAGE",
  COMMIT_PROPOSAL_ENVELOPE: "COMMIT_PROPOSAL_ENVELOPE",
  CLOSE_TENDER: "CLOSE_TENDER",
  REQUEST_KEY_RELEASE: "REQUEST_KEY_RELEASE",
  RELEASE_ENVELOPE_KEY: "RELEASE_ENVELOPE_KEY",
  DECLARE_CONFLICT_OF_INTEREST: "DECLARE_CONFLICT_OF_INTEREST",
  SUBMIT_EVALUATION_REPORT: "SUBMIT_EVALUATION_REPORT",
  SUBMIT_AWARD_RECOMMENDATION: "SUBMIT_AWARD_RECOMMENDATION",
  APPROVE_AWARD: "APPROVE_AWARD",
  COMMIT_CONTRACT_HASH: "COMMIT_CONTRACT_HASH",
  ARCHIVE_TENDER: "ARCHIVE_TENDER",
  APPROVE_EVALUATION: "APPROVE_EVALUATION",
  REJECT_EVALUATION: "REJECT_EVALUATION",
  APPROVE_PAYMENT: "APPROVE_PAYMENT",
  REJECT_PAYMENT: "REJECT_PAYMENT",
  CREATE_TENDER_VERSION: "CREATE_TENDER_VERSION",
  CANCEL_TENDER: "CANCEL_TENDER",
  VERIFY_DOCUMENT: "VERIFY_DOCUMENT",
  COMPLETE_PROCUREMENT: "COMPLETE_PROCUREMENT"
} as const;

export type ProcurementActionValue = (typeof ProcurementAction)[keyof typeof ProcurementAction];

export type TransitionInput = {
  tenderId?: string;
  action: ProcurementActionValue | string;
  actorRole: Role | string;
  actorEmployeeHash?: string;
  currentState?: TenderStateValue | string | null;
  metadata?: Record<string, unknown>;
};

export type TransitionRejectionType = "PERMISSION" | "WORKFLOW" | "VALIDATION";

export type TransitionResult = {
  allowed: boolean;
  fromState: TenderStateValue | null;
  toState: TenderStateValue | null;
  reason?: string;
  requiredRole?: Role;
  requiredPermission?: Permission;
  statusCode?: 403 | 409 | 422;
  rejectionType?: TransitionRejectionType;
};

type TransitionRule = {
  action: ProcurementActionValue;
  from: readonly (TenderStateValue | null)[];
  to: TenderStateValue | "UNCHANGED";
  role: Role;
  permission: Permission;
  mutatesState: boolean;
};

const roleValues = [
  "PROCUREMENT_OFFICER",
  "VENDOR",
  "EVALUATOR",
  "FINANCE_OFFICER",
  "AUDITOR",
  "TEC_MEMBER",
  "TEC_CHAIR",
  "APPROVING_OFFICER",
  "FINANCIAL_INSTITUTION_OFFICER"
] as const satisfies readonly Role[];

const allTenderStates = [
  TenderState.DRAFT,
  TenderState.PUBLICATION_PENDING,
  TenderState.PUBLISHED,
  TenderState.CREATED,
  TenderState.OPEN_FOR_BIDS,
  TenderState.OPEN_FOR_PROPOSALS,
  TenderState.BID_SUBMITTED,
  TenderState.CLOSED,
  TenderState.EVALUATION_PENDING,
  TenderState.TECHNICAL_EVALUATION,
  TenderState.FINANCIAL_EVALUATION,
  TenderState.EVALUATION_APPROVED,
  TenderState.AWARD_RECOMMENDED,
  TenderState.AWARD_APPROVED,
  TenderState.PAYMENT_PENDING,
  TenderState.PAYMENT_APPROVED,
  TenderState.CONTRACT_SIGNED,
  TenderState.COMPLETED,
  TenderState.ARCHIVED,
  TenderState.CANCELLED
] as const;

export const allowedTransitions = [
  {
    action: ProcurementAction.CREATE_TENDER,
    from: [null],
    to: TenderState.CREATED,
    role: "PROCUREMENT_OFFICER",
    permission: permissions.CREATE_TENDER,
    mutatesState: true
  },
  {
    action: ProcurementAction.CREATE_TENDER_MANIFEST,
    from: [null],
    to: TenderState.DRAFT,
    role: "PROCUREMENT_OFFICER",
    permission: permissions.CREATE_TENDER_MANIFEST,
    mutatesState: true
  },
  {
    action: ProcurementAction.REQUEST_PUBLICATION_APPROVAL,
    from: [TenderState.DRAFT, TenderState.CREATED],
    to: TenderState.PUBLICATION_PENDING,
    role: "PROCUREMENT_OFFICER",
    permission: permissions.REQUEST_PUBLICATION_APPROVAL,
    mutatesState: true
  },
  {
    action: ProcurementAction.APPROVE_TENDER_PUBLICATION,
    from: [TenderState.PUBLICATION_PENDING],
    to: TenderState.PUBLISHED,
    role: "APPROVING_OFFICER",
    permission: permissions.APPROVE_TENDER_PUBLICATION,
    mutatesState: true
  },
  {
    action: ProcurementAction.SUBMIT_BID,
    from: [TenderState.CREATED, TenderState.OPEN_FOR_BIDS],
    to: TenderState.BID_SUBMITTED,
    role: "VENDOR",
    permission: permissions.SUBMIT_BID,
    mutatesState: true
  },
  {
    action: ProcurementAction.SUBMIT_PROPOSAL_PACKAGE,
    from: [TenderState.PUBLISHED, TenderState.OPEN_FOR_PROPOSALS],
    to: "UNCHANGED",
    role: "VENDOR",
    permission: permissions.SUBMIT_PROPOSAL_PACKAGE,
    mutatesState: true
  },
  {
    action: ProcurementAction.COMMIT_PROPOSAL_ENVELOPE,
    from: [TenderState.PUBLISHED, TenderState.OPEN_FOR_PROPOSALS],
    to: "UNCHANGED",
    role: "VENDOR",
    permission: permissions.COMMIT_PROPOSAL_ENVELOPE,
    mutatesState: true
  },
  {
    action: ProcurementAction.CLOSE_TENDER,
    from: [TenderState.PUBLISHED, TenderState.OPEN_FOR_PROPOSALS],
    to: TenderState.CLOSED,
    role: "PROCUREMENT_OFFICER",
    permission: permissions.CLOSE_TENDER,
    mutatesState: true
  },
  {
    action: ProcurementAction.REQUEST_KEY_RELEASE,
    from: [TenderState.CLOSED],
    to: TenderState.TECHNICAL_EVALUATION,
    role: "TEC_MEMBER",
    permission: permissions.REQUEST_KEY_RELEASE,
    mutatesState: true
  },
  {
    action: ProcurementAction.REQUEST_KEY_RELEASE,
    from: [TenderState.CLOSED],
    to: TenderState.TECHNICAL_EVALUATION,
    role: "TEC_CHAIR",
    permission: permissions.REQUEST_KEY_RELEASE,
    mutatesState: true
  },
  {
    action: ProcurementAction.REQUEST_KEY_RELEASE,
    from: [TenderState.TECHNICAL_EVALUATION, TenderState.FINANCIAL_EVALUATION],
    to: "UNCHANGED",
    role: "TEC_MEMBER",
    permission: permissions.REQUEST_KEY_RELEASE,
    mutatesState: false
  },
  {
    action: ProcurementAction.REQUEST_KEY_RELEASE,
    from: [TenderState.TECHNICAL_EVALUATION, TenderState.FINANCIAL_EVALUATION],
    to: "UNCHANGED",
    role: "TEC_CHAIR",
    permission: permissions.REQUEST_KEY_RELEASE,
    mutatesState: false
  },
  {
    action: ProcurementAction.REQUEST_KEY_RELEASE,
    from: [TenderState.AWARD_APPROVED],
    to: "UNCHANGED",
    role: "FINANCIAL_INSTITUTION_OFFICER",
    permission: permissions.REQUEST_KEY_RELEASE,
    mutatesState: false
  },
  {
    action: ProcurementAction.RELEASE_ENVELOPE_KEY,
    from: [TenderState.TECHNICAL_EVALUATION, TenderState.FINANCIAL_EVALUATION],
    to: "UNCHANGED",
    role: "TEC_CHAIR",
    permission: permissions.RELEASE_ENVELOPE_KEY,
    mutatesState: false
  },
  {
    action: ProcurementAction.RELEASE_ENVELOPE_KEY,
    from: [TenderState.AWARD_APPROVED],
    to: "UNCHANGED",
    role: "FINANCIAL_INSTITUTION_OFFICER",
    permission: permissions.RELEASE_ENVELOPE_KEY,
    mutatesState: false
  },
  {
    action: ProcurementAction.DECLARE_CONFLICT_OF_INTEREST,
    from: [TenderState.PUBLISHED, TenderState.CLOSED, TenderState.TECHNICAL_EVALUATION, TenderState.FINANCIAL_EVALUATION],
    to: "UNCHANGED",
    role: "TEC_MEMBER",
    permission: permissions.DECLARE_CONFLICT_OF_INTEREST,
    mutatesState: false
  },
  {
    action: ProcurementAction.DECLARE_CONFLICT_OF_INTEREST,
    from: [TenderState.PUBLISHED, TenderState.CLOSED, TenderState.TECHNICAL_EVALUATION, TenderState.FINANCIAL_EVALUATION],
    to: "UNCHANGED",
    role: "TEC_CHAIR",
    permission: permissions.DECLARE_CONFLICT_OF_INTEREST,
    mutatesState: false
  },
  {
    action: ProcurementAction.SUBMIT_EVALUATION_REPORT,
    from: [TenderState.TECHNICAL_EVALUATION],
    to: TenderState.FINANCIAL_EVALUATION,
    role: "TEC_CHAIR",
    permission: permissions.SUBMIT_EVALUATION_REPORT,
    mutatesState: true
  },
  {
    action: ProcurementAction.SUBMIT_EVALUATION_REPORT,
    from: [TenderState.TECHNICAL_EVALUATION, TenderState.FINANCIAL_EVALUATION],
    to: "UNCHANGED",
    role: "TEC_MEMBER",
    permission: permissions.SUBMIT_EVALUATION_REPORT,
    mutatesState: true
  },
  {
    action: ProcurementAction.SUBMIT_EVALUATION_REPORT,
    from: [TenderState.FINANCIAL_EVALUATION],
    to: "UNCHANGED",
    role: "TEC_CHAIR",
    permission: permissions.SUBMIT_EVALUATION_REPORT,
    mutatesState: true
  },
  {
    action: ProcurementAction.SUBMIT_AWARD_RECOMMENDATION,
    from: [TenderState.FINANCIAL_EVALUATION, TenderState.AWARD_RECOMMENDED],
    to: TenderState.AWARD_RECOMMENDED,
    role: "TEC_CHAIR",
    permission: permissions.SUBMIT_AWARD_RECOMMENDATION,
    mutatesState: true
  },
  {
    action: ProcurementAction.APPROVE_AWARD,
    from: [TenderState.AWARD_RECOMMENDED],
    to: TenderState.AWARD_APPROVED,
    role: "APPROVING_OFFICER",
    permission: permissions.APPROVE_AWARD,
    mutatesState: true
  },
  {
    action: ProcurementAction.COMMIT_CONTRACT_HASH,
    from: [TenderState.AWARD_APPROVED, TenderState.CONTRACT_SIGNED],
    to: TenderState.CONTRACT_SIGNED,
    role: "PROCUREMENT_OFFICER",
    permission: permissions.COMMIT_CONTRACT_HASH,
    mutatesState: true
  },
  {
    action: ProcurementAction.COMMIT_CONTRACT_HASH,
    from: [TenderState.AWARD_APPROVED, TenderState.CONTRACT_SIGNED],
    to: TenderState.CONTRACT_SIGNED,
    role: "APPROVING_OFFICER",
    permission: permissions.COMMIT_CONTRACT_HASH,
    mutatesState: true
  },
  {
    action: ProcurementAction.ARCHIVE_TENDER,
    from: [TenderState.CONTRACT_SIGNED],
    to: TenderState.ARCHIVED,
    role: "PROCUREMENT_OFFICER",
    permission: permissions.ARCHIVE_TENDER,
    mutatesState: true
  },
  {
    action: ProcurementAction.APPROVE_EVALUATION,
    from: [TenderState.BID_SUBMITTED, TenderState.EVALUATION_PENDING],
    to: TenderState.EVALUATION_APPROVED,
    role: "EVALUATOR",
    permission: permissions.APPROVE_EVALUATION,
    mutatesState: true
  },
  {
    action: ProcurementAction.REJECT_EVALUATION,
    from: [TenderState.BID_SUBMITTED, TenderState.EVALUATION_PENDING],
    to: TenderState.BID_SUBMITTED,
    role: "EVALUATOR",
    permission: permissions.REJECT_EVALUATION,
    mutatesState: true
  },
  {
    action: ProcurementAction.APPROVE_PAYMENT,
    from: [TenderState.EVALUATION_APPROVED, TenderState.PAYMENT_PENDING],
    to: TenderState.PAYMENT_APPROVED,
    role: "FINANCE_OFFICER",
    permission: permissions.APPROVE_PAYMENT,
    mutatesState: true
  },
  {
    action: ProcurementAction.REJECT_PAYMENT,
    from: [TenderState.EVALUATION_APPROVED, TenderState.PAYMENT_PENDING],
    to: TenderState.EVALUATION_APPROVED,
    role: "FINANCE_OFFICER",
    permission: permissions.REJECT_PAYMENT,
    mutatesState: true
  },
  {
    action: ProcurementAction.CREATE_TENDER_VERSION,
    from: [TenderState.CREATED, TenderState.OPEN_FOR_BIDS],
    to: "UNCHANGED",
    role: "PROCUREMENT_OFFICER",
    permission: permissions.CREATE_TENDER_VERSION,
    mutatesState: true
  },
  {
    action: ProcurementAction.CANCEL_TENDER,
    from: [
      TenderState.DRAFT,
      TenderState.PUBLICATION_PENDING,
      TenderState.PUBLISHED,
      TenderState.CREATED,
      TenderState.OPEN_FOR_BIDS,
      TenderState.OPEN_FOR_PROPOSALS,
      TenderState.BID_SUBMITTED,
      TenderState.CLOSED,
      TenderState.EVALUATION_PENDING,
      TenderState.TECHNICAL_EVALUATION,
      TenderState.FINANCIAL_EVALUATION
    ],
    to: TenderState.CANCELLED,
    role: "PROCUREMENT_OFFICER",
    permission: permissions.CANCEL_TENDER,
    mutatesState: true
  },
  {
    action: ProcurementAction.VERIFY_DOCUMENT,
    from: allTenderStates,
    to: "UNCHANGED",
    role: "AUDITOR",
    permission: permissions.VERIFY_DOCUMENT,
    mutatesState: false
  },
  {
    action: ProcurementAction.COMPLETE_PROCUREMENT,
    from: [TenderState.PAYMENT_APPROVED],
    to: TenderState.COMPLETED,
    role: "FINANCE_OFFICER",
    permission: permissions.COMPLETE_PROCUREMENT,
    mutatesState: true
  }
] as const satisfies readonly TransitionRule[];

function isRole(value: string): value is Role {
  return (roleValues as readonly string[]).includes(value);
}

function isTenderState(value: string): value is TenderStateValue {
  return (allTenderStates as readonly string[]).includes(value);
}

function isProcurementAction(value: string): value is ProcurementActionValue {
  return (Object.values(ProcurementAction) as readonly string[]).includes(value);
}

function isOverwriteAction(action: string): boolean {
  return ["UPDATE_TENDER", "EDIT_TENDER", "OVERWRITE_TENDER"].includes(action);
}

function hasOverwriteMetadata(metadata: Record<string, unknown> | undefined): boolean {
  if (!metadata) {
    return false;
  }

  return (
    metadata.overwriteOriginal === true ||
    metadata.overwriteOriginalTender === true ||
    metadata.silentOverwrite === true ||
    metadata.directUpdate === true ||
    metadata.updateMode === "overwrite"
  );
}

function envelopeType(input: TransitionInput): string | null {
  const value = input.metadata?.envelopeType;
  return typeof value === "string" ? value : null;
}

function awardApprovalThresholdMissing(input: TransitionInput): boolean {
  return input.metadata?.thresholdApprovalsMet === false || input.metadata?.awardApprovalThresholdMet === false;
}

function resolveNextState(rule: TransitionRule, fromState: TenderStateValue | null): TenderStateValue | null {
  return rule.to === "UNCHANGED" ? fromState : rule.to;
}

function ruleAllowsState(rule: TransitionRule, state: TenderStateValue | null): boolean {
  return rule.from.includes(state);
}

function validationFailure(fromState: TenderStateValue | null, reason: string): TransitionResult {
  return {
    allowed: false,
    fromState,
    toState: null,
    reason,
    statusCode: 422,
    rejectionType: "VALIDATION"
  };
}

function permissionFailure(
  fromState: TenderStateValue | null,
  reason: string,
  rule?: TransitionRule
): TransitionResult {
  return {
    allowed: false,
    fromState,
    toState: null,
    reason,
    requiredRole: rule?.role,
    requiredPermission: rule?.permission,
    statusCode: 403,
    rejectionType: "PERMISSION"
  };
}

function workflowFailure(fromState: TenderStateValue | null, reason: string, rule: TransitionRule): TransitionResult {
  return {
    allowed: false,
    fromState,
    toState: null,
    reason,
    requiredRole: rule.role,
    requiredPermission: rule.permission,
    statusCode: 409,
    rejectionType: "WORKFLOW"
  };
}

function invalidStateReason(action: ProcurementActionValue, fromState: TenderStateValue | null): string {
  if (fromState === TenderState.CANCELLED) {
    return "TENDER_ALREADY_CANCELLED";
  }

  if (fromState === TenderState.ARCHIVED || fromState === TenderState.COMPLETED) {
    return fromState === TenderState.ARCHIVED ? "TENDER_ALREADY_ARCHIVED" : "TENDER_ALREADY_COMPLETED";
  }

  if (action === ProcurementAction.SUBMIT_PROPOSAL_PACKAGE || action === ProcurementAction.COMMIT_PROPOSAL_ENVELOPE) {
    return "PROPOSAL_SUBMISSION_CLOSED";
  }

  if (action === ProcurementAction.SUBMIT_EVALUATION_REPORT) {
    return "TENDER_MUST_BE_CLOSED_BEFORE_EVALUATION";
  }

  if (action === ProcurementAction.REQUEST_KEY_RELEASE || action === ProcurementAction.RELEASE_ENVELOPE_KEY) {
    return "KEY_RELEASE_STAGE_NOT_ALLOWED";
  }

  if (action === ProcurementAction.SUBMIT_AWARD_RECOMMENDATION) {
    return "FINANCIAL_EVALUATION_REQUIRED_BEFORE_AWARD_RECOMMENDATION";
  }

  if (action === ProcurementAction.APPROVE_AWARD) {
    return "AWARD_RECOMMENDATION_REQUIRED";
  }

  if (action === ProcurementAction.COMMIT_CONTRACT_HASH) {
    return "AWARD_APPROVAL_REQUIRED_BEFORE_CONTRACT";
  }

  if (action === ProcurementAction.ARCHIVE_TENDER) {
    return "CONTRACT_PROOF_REQUIRED_BEFORE_ARCHIVE";
  }

  if (action === ProcurementAction.CLOSE_TENDER) {
    return "TENDER_NOT_OPEN_FOR_CLOSING";
  }

  if (action === ProcurementAction.APPROVE_PAYMENT) {
    return "EVALUATION_REQUIRED_BEFORE_PAYMENT";
  }

  if (action === ProcurementAction.CREATE_TENDER_VERSION) {
    return "TENDER_VERSION_LOCKED_AFTER_BID_SUBMISSION";
  }

  if (action === ProcurementAction.CREATE_TENDER && fromState !== null) {
    return "TENDER_ALREADY_EXISTS";
  }

  if (fromState === null) {
    return "TENDER_NOT_CREATED";
  }

  return "INVALID_STATE_TRANSITION";
}

export function canTransition(input: TransitionInput): TransitionResult {
  const rawAction = typeof input.action === "string" ? input.action : "";
  const rawRole = typeof input.actorRole === "string" ? input.actorRole : "";
  const rawState = input.currentState ?? null;
  const fromState = typeof rawState === "string" && isTenderState(rawState) ? rawState : null;

  if (isOverwriteAction(rawAction)) {
    return validationFailure(fromState, "TENDER_HISTORY_IS_APPEND_ONLY");
  }

  if (!isProcurementAction(rawAction)) {
    return validationFailure(fromState, "UNKNOWN_ACTION");
  }

  if (!isRole(rawRole)) {
    return validationFailure(fromState, "INVALID_ACTOR_ROLE");
  }

  if (!input.actorEmployeeHash?.trim()) {
    return validationFailure(fromState, "ACTOR_EMPLOYEE_HASH_REQUIRED");
  }

  if (rawState !== null && (typeof rawState !== "string" || !isTenderState(rawState))) {
    return validationFailure(null, "INVALID_CURRENT_STATE");
  }

  const actionRules = allowedTransitions.filter((candidate) => candidate.action === rawAction);
  const roleRule = actionRules.find((candidate) => candidate.role === rawRole);

  if (!roleRule) {
    return permissionFailure(fromState, "ROLE_NOT_ALLOWED", actionRules[0]);
  }

  if (!hasPermission(rawRole, roleRule.permission)) {
    return permissionFailure(fromState, "PERMISSION_MISSING", roleRule);
  }

  if (
    rawAction !== ProcurementAction.CREATE_TENDER &&
    rawAction !== ProcurementAction.CREATE_TENDER_MANIFEST &&
    fromState === null
  ) {
    return validationFailure(fromState, "CURRENT_STATE_REQUIRED");
  }

  if (rawAction === ProcurementAction.CREATE_TENDER_VERSION && hasOverwriteMetadata(input.metadata)) {
    return validationFailure(fromState, "TENDER_HISTORY_IS_APPEND_ONLY");
  }

  if (
    rawAction === ProcurementAction.REQUEST_KEY_RELEASE &&
    envelopeType(input) === "FINANCIAL" &&
    fromState !== TenderState.FINANCIAL_EVALUATION
  ) {
    return workflowFailure(fromState, "FINANCIAL_OPENING_REQUIRES_TECHNICAL_COMPLETION", roleRule);
  }

  if (rawAction === ProcurementAction.APPROVE_AWARD && awardApprovalThresholdMissing(input)) {
    return workflowFailure(fromState, "AWARD_APPROVAL_THRESHOLD_NOT_MET", roleRule);
  }

  if (roleRule.mutatesState && fromState === TenderState.CANCELLED) {
    return workflowFailure(fromState, "TENDER_ALREADY_CANCELLED", roleRule);
  }

  if (roleRule.mutatesState && (fromState === TenderState.COMPLETED || fromState === TenderState.ARCHIVED)) {
    return workflowFailure(
      fromState,
      fromState === TenderState.ARCHIVED ? "TENDER_ALREADY_ARCHIVED" : "TENDER_ALREADY_COMPLETED",
      roleRule
    );
  }

  if (!ruleAllowsState(roleRule, fromState)) {
    return workflowFailure(fromState, invalidStateReason(rawAction, fromState), roleRule);
  }

  return {
    allowed: true,
    fromState,
    toState: resolveNextState(roleRule, fromState),
    requiredRole: roleRule.role,
    requiredPermission: roleRule.permission
  };
}

export function assertTransitionAllowed(input: TransitionInput): TransitionResult {
  const result = canTransition(input);

  if (result.allowed) {
    return result;
  }

  if (result.statusCode === 403) {
    throw new AuthorizationError("Your verified role cannot perform this procurement action.", result);
  }

  if (result.statusCode === 422) {
    throw new ValidationError("Procurement transition payload is invalid.", result);
  }

  throw new InvalidTransitionError("Procurement workflow rejected this action.", result);
}

export function getAllowedActionsForRole(
  role: Role | string,
  currentState: TenderStateValue | string | null
): ProcurementActionValue[] {
  if (typeof role !== "string" || !isRole(role)) {
    return [];
  }

  if (currentState !== null && (typeof currentState !== "string" || !isTenderState(currentState))) {
    return [];
  }

  return allowedTransitions
    .filter(
      (rule) =>
        rule.role === role &&
        hasPermission(role, rule.permission) &&
        ruleAllowsState(rule, currentState as TenderStateValue | null)
    )
    .map((rule) => rule.action);
}

export function getNextState(
  action: ProcurementActionValue | string,
  currentState: TenderStateValue | string | null
): TenderStateValue | null {
  if (typeof action !== "string" || !isProcurementAction(action)) {
    return null;
  }

  if (currentState !== null && (typeof currentState !== "string" || !isTenderState(currentState))) {
    return null;
  }

  const rule = allowedTransitions.find(
    (candidate) => candidate.action === action && ruleAllowsState(candidate, currentState as TenderStateValue | null)
  );
  return rule ? resolveNextState(rule, currentState as TenderStateValue | null) : null;
}

export function explainRejection(input: TransitionInput): string | undefined {
  const result = canTransition(input);
  return result.allowed ? undefined : result.reason;
}
