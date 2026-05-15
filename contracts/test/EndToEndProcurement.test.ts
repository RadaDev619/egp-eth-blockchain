import { expect } from "chai";
import {
  bidHash,
  createTender,
  deployContracts,
  evaluatorEmployeeHash,
  evaluatorRole,
  financeEmployeeHash,
  financeRole,
  metadataHash,
  secondTenderId,
  tenderId,
  vendorEmployeeHash,
  vendorRole
} from "./helpers";

describe("End-to-end procurement contract flow", () => {
  it("records tender creation, bid submission, evaluation approval, and payment approval through the relayer", async () => {
    const { relayer, tenderRegistry, approvalManager, auditLog } = await deployContracts();

    await createTender(tenderRegistry, relayer);
    await tenderRegistry.connect(relayer).recordBidSubmitted(tenderId, vendorEmployeeHash, vendorRole, bidHash, metadataHash);
    await approvalManager
      .connect(relayer)
      .recordEvaluationApproved(tenderId, evaluatorEmployeeHash, evaluatorRole, "BID_SUBMITTED", "EVALUATION_APPROVED", metadataHash);
    await approvalManager
      .connect(relayer)
      .recordPaymentApproved(tenderId, financeEmployeeHash, financeRole, "EVALUATION_APPROVED", "PAYMENT_APPROVED", metadataHash);
    await auditLog
      .connect(relayer)
      .recordAuditEvent(tenderId, "PAYMENT_APPROVED", financeEmployeeHash, financeRole, "EVALUATION_APPROVED", "PAYMENT_APPROVED", metadataHash);

    const tender = await tenderRegistry.getTender(tenderId);
    const approvalState = await approvalManager.getApprovalState(tenderId);

    expect(tender.currentState).to.equal("BID_SUBMITTED");
    expect(approvalState.evaluationApproved).to.equal(true);
    expect(approvalState.paymentApproved).to.equal(true);
  });

  it("prevents approval bypass even when called by the authorized relayer", async () => {
    const { relayer, tenderRegistry, approvalManager } = await deployContracts();

    await createTender(tenderRegistry, relayer, secondTenderId);

    await expect(
      approvalManager
        .connect(relayer)
        .recordPaymentApproved(secondTenderId, financeEmployeeHash, financeRole, "BID_SUBMITTED", "PAYMENT_APPROVED", metadataHash)
    ).to.be.revertedWith("EVALUATION_APPROVAL_REQUIRED");
  });
});
