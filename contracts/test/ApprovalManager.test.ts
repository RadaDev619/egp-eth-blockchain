import { expect } from "chai";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import {
  createTender,
  deployContracts,
  evaluatorEmployeeHash,
  evaluatorRole,
  financeEmployeeHash,
  financeRole,
  metadataHash,
  tenderId,
  tenderKey
} from "./helpers";

describe("ApprovalManager", () => {
  it("records evaluation approval from the authorized relayer", async () => {
    const { relayer, tenderRegistry, approvalManager } = await deployContracts();
    await createTender(tenderRegistry, relayer);

    await expect(
      approvalManager
        .connect(relayer)
        .recordEvaluationApproved(tenderId, evaluatorEmployeeHash, evaluatorRole, "BID_SUBMITTED", "EVALUATION_APPROVED", metadataHash)
    )
      .to.emit(approvalManager, "EvaluationApproved")
      .withArgs(
        tenderKey(tenderId),
        tenderId,
        evaluatorEmployeeHash,
        evaluatorRole,
        "BID_SUBMITTED",
        "EVALUATION_APPROVED",
        metadataHash,
        anyValue
      );

    const state = await approvalManager.getApprovalState(tenderId);
    expect(state.evaluationApproved).to.equal(true);
  });

  it("blocks payment approval before evaluation approval", async () => {
    const { relayer, tenderRegistry, approvalManager } = await deployContracts();
    await createTender(tenderRegistry, relayer);

    await expect(
      approvalManager
        .connect(relayer)
        .recordPaymentApproved(tenderId, financeEmployeeHash, financeRole, "BID_SUBMITTED", "PAYMENT_APPROVED", metadataHash)
    ).to.be.revertedWith("EVALUATION_APPROVAL_REQUIRED");
  });

  it("records payment approval after evaluation approval", async () => {
    const { relayer, tenderRegistry, approvalManager } = await deployContracts();
    await createTender(tenderRegistry, relayer);

    await approvalManager
      .connect(relayer)
      .recordEvaluationApproved(tenderId, evaluatorEmployeeHash, evaluatorRole, "BID_SUBMITTED", "EVALUATION_APPROVED", metadataHash);

    await expect(
      approvalManager
        .connect(relayer)
        .recordPaymentApproved(tenderId, financeEmployeeHash, financeRole, "EVALUATION_APPROVED", "PAYMENT_APPROVED", metadataHash)
    )
      .to.emit(approvalManager, "PaymentApproved")
      .withArgs(
        tenderKey(tenderId),
        tenderId,
        financeEmployeeHash,
        financeRole,
        "EVALUATION_APPROVED",
        "PAYMENT_APPROVED",
        metadataHash,
        anyValue
      );

    const state = await approvalManager.getApprovalState(tenderId);
    expect(state.paymentApproved).to.equal(true);
  });

  it("rejects duplicate payment approvals", async () => {
    const { relayer, tenderRegistry, approvalManager } = await deployContracts();
    await createTender(tenderRegistry, relayer);

    await approvalManager
      .connect(relayer)
      .recordEvaluationApproved(tenderId, evaluatorEmployeeHash, evaluatorRole, "BID_SUBMITTED", "EVALUATION_APPROVED", metadataHash);
    await approvalManager
      .connect(relayer)
      .recordPaymentApproved(tenderId, financeEmployeeHash, financeRole, "EVALUATION_APPROVED", "PAYMENT_APPROVED", metadataHash);

    await expect(
      approvalManager
        .connect(relayer)
        .recordPaymentApproved(tenderId, financeEmployeeHash, financeRole, "EVALUATION_APPROVED", "PAYMENT_APPROVED", metadataHash)
    ).to.be.revertedWith("PAYMENT_ALREADY_APPROVED");
  });

  it("blocks unauthorized addresses from recording approvals", async () => {
    const { outsider, relayer, tenderRegistry, approvalManager } = await deployContracts();
    await createTender(tenderRegistry, relayer);

    await expect(
      approvalManager
        .connect(outsider)
        .recordEvaluationApproved(tenderId, evaluatorEmployeeHash, evaluatorRole, "BID_SUBMITTED", "EVALUATION_APPROVED", metadataHash)
    ).to.be.revertedWith("RELAYER_NOT_AUTHORIZED");
  });
});
