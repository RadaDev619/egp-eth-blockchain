import { expect } from "chai";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import {
  bidHash,
  createTender,
  deployContracts,
  documentHash,
  evaluatorEmployeeHash,
  evaluatorRole,
  financeEmployeeHash,
  financeRole,
  metadataHash,
  procurementEmployeeHash,
  procurementRole,
  tenderId,
  tenderKey,
  vendorEmployeeHash,
  vendorRole
} from "./helpers";

function parsedEventText(receipt: any, contracts: any[]) {
  return receipt.logs
    .map((log: unknown) => {
      for (const contract of contracts) {
        try {
          return contract.interface.parseLog(log);
        } catch {
          // Try the next contract interface.
        }
      }

      return null;
    })
    .filter(Boolean)
    .map((event: any) => event.args.join(" "))
    .join(" ");
}

describe("security regression coverage", () => {
  it("allows only the authorized backend relayer to write procurement proof events", async () => {
    const { relayer, outsider, tenderRegistry, approvalManager, auditLog } = await deployContracts();

    await expect(
      tenderRegistry
        .connect(outsider)
        .recordTenderCreated(tenderId, procurementEmployeeHash, procurementRole, documentHash, "ipfs://doc-v1", metadataHash)
    ).to.be.revertedWith("RELAYER_NOT_AUTHORIZED");

    await createTender(tenderRegistry, relayer);

    await expect(
      approvalManager
        .connect(outsider)
        .recordEvaluationApproved(tenderId, evaluatorEmployeeHash, evaluatorRole, "BID_SUBMITTED", "EVALUATION_APPROVED", metadataHash)
    ).to.be.revertedWith("RELAYER_NOT_AUTHORIZED");

    await expect(
      auditLog
        .connect(outsider)
        .recordAuditEvent(tenderId, "TENDER_CREATED", procurementEmployeeHash, procurementRole, "", "CREATED", metadataHash)
    ).to.be.revertedWith("RELAYER_NOT_AUTHORIZED");
  });

  it("emits tender creation metadata from the authorized relayer", async () => {
    const { relayer, tenderRegistry } = await deployContracts();

    await expect(
      tenderRegistry
        .connect(relayer)
        .recordTenderCreated(tenderId, procurementEmployeeHash, procurementRole, documentHash, "ipfs://doc-v1", metadataHash)
    )
      .to.emit(tenderRegistry, "TenderCreated")
      .withArgs(
        tenderKey(tenderId),
        tenderId,
        procurementEmployeeHash,
        procurementRole,
        documentHash,
        "ipfs://doc-v1",
        metadataHash,
        anyValue
      );
  });

  it("enforces payment approval after evaluation approval", async () => {
    const { relayer, tenderRegistry, approvalManager } = await deployContracts();
    await createTender(tenderRegistry, relayer);

    await expect(
      approvalManager
        .connect(relayer)
        .recordPaymentApproved(tenderId, financeEmployeeHash, financeRole, "BID_SUBMITTED", "PAYMENT_APPROVED", metadataHash)
    ).to.be.revertedWith("EVALUATION_APPROVAL_REQUIRED");

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
  });

  it("does not emit raw Employment ID across tender, bid, approval, or audit events", async () => {
    const { relayer, tenderRegistry, approvalManager, auditLog } = await deployContracts();

    const createTx = await tenderRegistry
      .connect(relayer)
      .recordTenderCreated(tenderId, procurementEmployeeHash, procurementRole, documentHash, "ipfs://doc-v1", metadataHash);
    const bidTx = await tenderRegistry.connect(relayer).recordBidSubmitted(tenderId, vendorEmployeeHash, vendorRole, bidHash, metadataHash);
    const evaluationTx = await approvalManager
      .connect(relayer)
      .recordEvaluationApproved(tenderId, evaluatorEmployeeHash, evaluatorRole, "BID_SUBMITTED", "EVALUATION_APPROVED", metadataHash);
    const paymentTx = await approvalManager
      .connect(relayer)
      .recordPaymentApproved(tenderId, financeEmployeeHash, financeRole, "EVALUATION_APPROVED", "PAYMENT_APPROVED", metadataHash);
    const auditTx = await auditLog
      .connect(relayer)
      .recordAuditEvent(tenderId, "PAYMENT_APPROVED", financeEmployeeHash, financeRole, "EVALUATION_APPROVED", "PAYMENT_APPROVED", metadataHash);

    const eventText = [
      parsedEventText(await createTx.wait(), [tenderRegistry]),
      parsedEventText(await bidTx.wait(), [tenderRegistry]),
      parsedEventText(await evaluationTx.wait(), [approvalManager]),
      parsedEventText(await paymentTx.wait(), [approvalManager]),
      parsedEventText(await auditTx.wait(), [auditLog])
    ].join(" ");

    expect(eventText).to.not.contain("PROC-001");
    expect(eventText).to.not.contain("VEND-001");
    expect(eventText).to.not.contain("EVAL-001");
    expect(eventText).to.not.contain("FIN-001");
    expect(eventText).to.contain(procurementEmployeeHash);
    expect(eventText).to.contain(vendorEmployeeHash);
    expect(eventText).to.contain(evaluatorEmployeeHash);
    expect(eventText).to.contain(financeEmployeeHash);
  });
});
