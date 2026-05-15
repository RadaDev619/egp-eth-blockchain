import { describe, expect, it } from "vitest";
import {
  assertTransitionAllowed,
  canTransition,
  explainRejection,
  getAllowedActionsForRole,
  getNextState,
  ProcurementAction,
  TenderState
} from "../../src/services/procurementStateMachine.js";
import { AuthorizationError, InvalidTransitionError, ValidationError } from "../../src/utils/errors.js";

const actorEmployeeHash = "0xabc";

describe("procurementStateMachine", () => {
  it("allows the required happy-path procurement sequence", () => {
    expect(
      canTransition({
        action: ProcurementAction.CREATE_TENDER,
        actorRole: "PROCUREMENT_OFFICER",
        actorEmployeeHash,
        currentState: null
      })
    ).toMatchObject({ allowed: true, fromState: null, toState: TenderState.CREATED });

    expect(
      canTransition({
        action: ProcurementAction.SUBMIT_BID,
        actorRole: "VENDOR",
        actorEmployeeHash,
        currentState: TenderState.CREATED
      })
    ).toMatchObject({ allowed: true, fromState: TenderState.CREATED, toState: TenderState.BID_SUBMITTED });

    expect(
      canTransition({
        action: ProcurementAction.APPROVE_EVALUATION,
        actorRole: "EVALUATOR",
        actorEmployeeHash,
        currentState: TenderState.BID_SUBMITTED
      })
    ).toMatchObject({
      allowed: true,
      fromState: TenderState.BID_SUBMITTED,
      toState: TenderState.EVALUATION_APPROVED
    });

    expect(
      canTransition({
        action: ProcurementAction.APPROVE_PAYMENT,
        actorRole: "FINANCE_OFFICER",
        actorEmployeeHash,
        currentState: TenderState.EVALUATION_APPROVED
      })
    ).toMatchObject({
      allowed: true,
      fromState: TenderState.EVALUATION_APPROVED,
      toState: TenderState.PAYMENT_APPROVED
    });
  });

  it("supports the updated secure procurement lifecycle", () => {
    expect(
      canTransition({
        action: ProcurementAction.CREATE_TENDER_MANIFEST,
        actorRole: "PROCUREMENT_OFFICER",
        actorEmployeeHash,
        currentState: null
      })
    ).toMatchObject({ allowed: true, fromState: null, toState: TenderState.DRAFT });

    expect(
      canTransition({
        action: ProcurementAction.REQUEST_PUBLICATION_APPROVAL,
        actorRole: "PROCUREMENT_OFFICER",
        actorEmployeeHash,
        currentState: TenderState.DRAFT
      })
    ).toMatchObject({ allowed: true, toState: TenderState.PUBLICATION_PENDING });

    expect(
      canTransition({
        action: ProcurementAction.APPROVE_TENDER_PUBLICATION,
        actorRole: "APPROVING_OFFICER",
        actorEmployeeHash,
        currentState: TenderState.PUBLICATION_PENDING
      })
    ).toMatchObject({ allowed: true, toState: TenderState.PUBLISHED });

    expect(
      canTransition({
        action: ProcurementAction.SUBMIT_PROPOSAL_PACKAGE,
        actorRole: "VENDOR",
        actorEmployeeHash,
        currentState: TenderState.PUBLISHED
      })
    ).toMatchObject({ allowed: true, toState: TenderState.PUBLISHED });

    expect(
      canTransition({
        action: ProcurementAction.CLOSE_TENDER,
        actorRole: "PROCUREMENT_OFFICER",
        actorEmployeeHash,
        currentState: TenderState.PUBLISHED
      })
    ).toMatchObject({ allowed: true, toState: TenderState.CLOSED });

    expect(
      canTransition({
        action: ProcurementAction.REQUEST_KEY_RELEASE,
        actorRole: "TEC_CHAIR",
        actorEmployeeHash,
        currentState: TenderState.CLOSED,
        metadata: { envelopeType: "TECHNICAL" }
      })
    ).toMatchObject({ allowed: true, toState: TenderState.TECHNICAL_EVALUATION });

    expect(
      canTransition({
        action: ProcurementAction.SUBMIT_EVALUATION_REPORT,
        actorRole: "TEC_CHAIR",
        actorEmployeeHash,
        currentState: TenderState.TECHNICAL_EVALUATION
      })
    ).toMatchObject({ allowed: true, toState: TenderState.FINANCIAL_EVALUATION });

    expect(
      canTransition({
        action: ProcurementAction.SUBMIT_AWARD_RECOMMENDATION,
        actorRole: "TEC_CHAIR",
        actorEmployeeHash,
        currentState: TenderState.FINANCIAL_EVALUATION
      })
    ).toMatchObject({ allowed: true, toState: TenderState.AWARD_RECOMMENDED });

    expect(
      canTransition({
        action: ProcurementAction.APPROVE_AWARD,
        actorRole: "APPROVING_OFFICER",
        actorEmployeeHash,
        currentState: TenderState.AWARD_RECOMMENDED,
        metadata: { thresholdApprovalsMet: true }
      })
    ).toMatchObject({ allowed: true, toState: TenderState.AWARD_APPROVED });

    expect(
      canTransition({
        action: ProcurementAction.COMMIT_CONTRACT_HASH,
        actorRole: "PROCUREMENT_OFFICER",
        actorEmployeeHash,
        currentState: TenderState.AWARD_APPROVED
      })
    ).toMatchObject({ allowed: true, toState: TenderState.CONTRACT_SIGNED });

    expect(
      canTransition({
        action: ProcurementAction.ARCHIVE_TENDER,
        actorRole: "PROCUREMENT_OFFICER",
        actorEmployeeHash,
        currentState: TenderState.CONTRACT_SIGNED
      })
    ).toMatchObject({ allowed: true, toState: TenderState.ARCHIVED });
  });

  it("returns 409 when finance tries payment approval before evaluation approval", () => {
    const result = canTransition({
      action: ProcurementAction.APPROVE_PAYMENT,
      actorRole: "FINANCE_OFFICER",
      actorEmployeeHash,
      currentState: TenderState.BID_SUBMITTED
    });

    expect(result).toMatchObject({
      allowed: false,
      reason: "EVALUATION_REQUIRED_BEFORE_PAYMENT",
      statusCode: 409,
      rejectionType: "WORKFLOW"
    });
    expect(() =>
      assertTransitionAllowed({
        action: ProcurementAction.APPROVE_PAYMENT,
        actorRole: "FINANCE_OFFICER",
        actorEmployeeHash,
        currentState: TenderState.BID_SUBMITTED
      })
    ).toThrow(InvalidTransitionError);
  });

  it("returns 403 for wrong-role payment approval attempts", () => {
    for (const actorRole of ["VENDOR", "PROCUREMENT_OFFICER"] as const) {
      const result = canTransition({
        action: ProcurementAction.APPROVE_PAYMENT,
        actorRole,
        actorEmployeeHash,
        currentState: TenderState.EVALUATION_APPROVED
      });

      expect(result).toMatchObject({
        allowed: false,
        reason: "ROLE_NOT_ALLOWED",
        statusCode: 403,
        rejectionType: "PERMISSION"
      });
    }

    expect(() =>
      assertTransitionAllowed({
        action: ProcurementAction.APPROVE_PAYMENT,
        actorRole: "VENDOR",
        actorEmployeeHash,
        currentState: TenderState.EVALUATION_APPROVED
      })
    ).toThrow(AuthorizationError);
  });

  it("blocks auditor mutation while allowing document verification", () => {
    expect(
      canTransition({
        action: ProcurementAction.CREATE_TENDER,
        actorRole: "AUDITOR",
        actorEmployeeHash,
        currentState: null
      })
    ).toMatchObject({
      allowed: false,
      reason: "ROLE_NOT_ALLOWED",
      statusCode: 403
    });

    expect(
      canTransition({
        action: ProcurementAction.VERIFY_DOCUMENT,
        actorRole: "AUDITOR",
        actorEmployeeHash,
        currentState: TenderState.CANCELLED
      })
    ).toMatchObject({
      allowed: true,
      fromState: TenderState.CANCELLED,
      toState: TenderState.CANCELLED
    });
  });

  it("blocks cancelled tender normal approvals with 409", () => {
    const result = canTransition({
      action: ProcurementAction.APPROVE_EVALUATION,
      actorRole: "EVALUATOR",
      actorEmployeeHash,
      currentState: TenderState.CANCELLED
    });

    expect(result).toMatchObject({
      allowed: false,
      reason: "TENDER_ALREADY_CANCELLED",
      statusCode: 409,
      rejectionType: "WORKFLOW"
    });
  });

  it("blocks silent tender overwrite attempts with 422", () => {
    const result = canTransition({
      action: ProcurementAction.CREATE_TENDER_VERSION,
      actorRole: "PROCUREMENT_OFFICER",
      actorEmployeeHash,
      currentState: TenderState.CREATED,
      metadata: {
        overwriteOriginalTender: true
      }
    });

    expect(result).toMatchObject({
      allowed: false,
      reason: "TENDER_HISTORY_IS_APPEND_ONLY",
      statusCode: 422,
      rejectionType: "VALIDATION"
    });
    expect(() =>
      assertTransitionAllowed({
        action: ProcurementAction.CREATE_TENDER_VERSION,
        actorRole: "PROCUREMENT_OFFICER",
        actorEmployeeHash,
        currentState: TenderState.CREATED,
        metadata: {
          overwriteOriginalTender: true
        }
      })
    ).toThrow(ValidationError);
  });

  it("blocks updated lifecycle bypass attempts with explicit reasons", () => {
    expect(
      canTransition({
        action: ProcurementAction.SUBMIT_PROPOSAL_PACKAGE,
        actorRole: "VENDOR",
        actorEmployeeHash,
        currentState: TenderState.CLOSED
      })
    ).toMatchObject({
      allowed: false,
      reason: "PROPOSAL_SUBMISSION_CLOSED",
      statusCode: 409
    });

    expect(
      canTransition({
        action: ProcurementAction.SUBMIT_EVALUATION_REPORT,
        actorRole: "TEC_CHAIR",
        actorEmployeeHash,
        currentState: TenderState.PUBLISHED
      })
    ).toMatchObject({
      allowed: false,
      reason: "TENDER_MUST_BE_CLOSED_BEFORE_EVALUATION",
      statusCode: 409
    });

    expect(
      canTransition({
        action: ProcurementAction.REQUEST_KEY_RELEASE,
        actorRole: "TEC_CHAIR",
        actorEmployeeHash,
        currentState: TenderState.TECHNICAL_EVALUATION,
        metadata: { envelopeType: "FINANCIAL" }
      })
    ).toMatchObject({
      allowed: false,
      reason: "FINANCIAL_OPENING_REQUIRES_TECHNICAL_COMPLETION",
      statusCode: 409
    });

    expect(
      canTransition({
        action: ProcurementAction.APPROVE_AWARD,
        actorRole: "APPROVING_OFFICER",
        actorEmployeeHash,
        currentState: TenderState.FINANCIAL_EVALUATION,
        metadata: { thresholdApprovalsMet: true }
      })
    ).toMatchObject({
      allowed: false,
      reason: "AWARD_RECOMMENDATION_REQUIRED",
      statusCode: 409
    });

    expect(
      canTransition({
        action: ProcurementAction.APPROVE_AWARD,
        actorRole: "APPROVING_OFFICER",
        actorEmployeeHash,
        currentState: TenderState.AWARD_RECOMMENDED,
        metadata: { thresholdApprovalsMet: false }
      })
    ).toMatchObject({
      allowed: false,
      reason: "AWARD_APPROVAL_THRESHOLD_NOT_MET",
      statusCode: 409
    });

    expect(
      canTransition({
        action: ProcurementAction.ARCHIVE_TENDER,
        actorRole: "PROCUREMENT_OFFICER",
        actorEmployeeHash,
        currentState: TenderState.AWARD_APPROVED
      })
    ).toMatchObject({
      allowed: false,
      reason: "CONTRACT_PROOF_REQUIRED_BEFORE_ARCHIVE",
      statusCode: 409
    });
  });

  it("returns 422 for invalid action payloads", () => {
    const result = canTransition({
      action: "UPDATE_TENDER",
      actorRole: "PROCUREMENT_OFFICER",
      actorEmployeeHash,
      currentState: TenderState.CREATED
    });

    expect(result).toMatchObject({
      allowed: false,
      reason: "TENDER_HISTORY_IS_APPEND_ONLY",
      statusCode: 422,
      rejectionType: "VALIDATION"
    });
  });

  it("reports allowed actions and next states without frontend trust", () => {
    expect(getAllowedActionsForRole("VENDOR", TenderState.CREATED)).toEqual([ProcurementAction.SUBMIT_BID]);
    expect(getAllowedActionsForRole("AUDITOR", TenderState.PAYMENT_APPROVED)).toEqual([
      ProcurementAction.VERIFY_DOCUMENT
    ]);
    expect(getAllowedActionsForRole("AUDITOR", TenderState.CREATED)).not.toContain(ProcurementAction.CANCEL_TENDER);
    expect(getNextState(ProcurementAction.CREATE_TENDER_VERSION, TenderState.CREATED)).toBe(TenderState.CREATED);
    expect(explainRejection({
      action: ProcurementAction.APPROVE_PAYMENT,
      actorRole: "FINANCE_OFFICER",
      actorEmployeeHash,
      currentState: TenderState.CREATED
    })).toBe("EVALUATION_REQUIRED_BEFORE_PAYMENT");
    expect(getAllowedActionsForRole("VENDOR", TenderState.PUBLISHED)).toEqual([
      ProcurementAction.SUBMIT_PROPOSAL_PACKAGE,
      ProcurementAction.COMMIT_PROPOSAL_ENVELOPE
    ]);
    expect(getNextState(ProcurementAction.CLOSE_TENDER, TenderState.OPEN_FOR_PROPOSALS)).toBe(TenderState.CLOSED);
  });
});
