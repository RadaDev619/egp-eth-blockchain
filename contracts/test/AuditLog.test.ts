import { expect } from "chai";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import {
  deployContracts,
  documentHash,
  financeEmployeeHash,
  financeRole,
  metadataHash,
  procurementEmployeeHash,
  procurementRole,
  reasonHash,
  tenderId,
  tenderKey,
  textHash,
  vendorEmployeeHash,
  vendorRole
} from "./helpers";

describe("AuditLog", () => {
  it("lets an authorized relayer emit immutable procurement audit events", async () => {
    const { relayer, auditLog } = await deployContracts();

    await expect(
      auditLog
        .connect(relayer)
        .recordAuditEvent(tenderId, "PAYMENT_APPROVED", financeEmployeeHash, financeRole, "EVALUATION_APPROVED", "PAYMENT_APPROVED", metadataHash)
    )
      .to.emit(auditLog, "ProcurementAuditEvent")
      .withArgs(
        tenderKey(tenderId),
        tenderId,
        "PAYMENT_APPROVED",
        financeEmployeeHash,
        financeRole,
        "EVALUATION_APPROVED",
        "PAYMENT_APPROVED",
        metadataHash,
        anyValue
      );
  });

  it("blocks unauthorized addresses from emitting audit events", async () => {
    const { outsider, auditLog } = await deployContracts();

    await expect(
      auditLog
        .connect(outsider)
        .recordAuditEvent(tenderId, "TENDER_CREATED", procurementEmployeeHash, procurementRole, "", "CREATED", metadataHash)
    ).to.be.revertedWith("RELAYER_NOT_AUTHORIZED");
  });

  it("emits blocked unauthorized attempts with reason hash", async () => {
    const { relayer, auditLog } = await deployContracts();

    await expect(
      auditLog.connect(relayer).recordUnauthorizedAttempt(tenderId, "APPROVE_PAYMENT", vendorEmployeeHash, vendorRole, reasonHash)
    )
      .to.emit(auditLog, "UnauthorizedActionAttempted")
      .withArgs(tenderKey(tenderId), tenderId, "APPROVE_PAYMENT", vendorEmployeeHash, vendorRole, reasonHash, anyValue);
  });

  it("emits tampering detected without storing raw document contents", async () => {
    const { relayer, auditLog } = await deployContracts();
    const observedDocumentHash = textHash("tampered-document.pdf");

    await expect(
      auditLog
        .connect(relayer)
        .recordTamperingDetected(tenderId, procurementEmployeeHash, procurementRole, documentHash, observedDocumentHash, metadataHash)
    )
      .to.emit(auditLog, "TamperingDetected")
      .withArgs(
        tenderKey(tenderId),
        tenderId,
        procurementEmployeeHash,
        procurementRole,
        documentHash,
        observedDocumentHash,
        metadataHash,
        anyValue
      );
  });

  it("emits metadata hashes instead of raw metadata or raw Employment ID", async () => {
    const { relayer, auditLog } = await deployContracts();

    const tx = await auditLog
      .connect(relayer)
      .recordAuditEvent(tenderId, "TENDER_CREATED", procurementEmployeeHash, procurementRole, "", "CREATED", metadataHash);
    const receipt = await tx.wait();
    const parsedLogs = receipt.logs
      .map((log: unknown) => {
        try {
          return auditLog.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const eventText = parsedLogs.map((event: any) => event.args.join(" ")).join(" ");
    expect(eventText).to.contain(metadataHash);
    expect(eventText).to.not.contain("canonical-procurement-metadata");
    expect(eventText).to.not.contain("PROC-001");
  });
});
