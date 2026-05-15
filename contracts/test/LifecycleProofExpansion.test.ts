import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import {
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
  textHash,
  vendorEmployeeHash,
  vendorRole
} from "./helpers";

const packageHash = textHash("proposal-package-commitment");
const technicalEnvelopeHash = textHash("technical-envelope-manifest");
const financialEnvelopeHash = textHash("financial-envelope-manifest");
const closureHash = textHash("tender-close-proof");
const keyReleaseHash = textHash("key-release-request-proof");
const evaluationReportHash = textHash("evaluation-report-proof");
const recommendationHash = textHash("award-recommendation-proof");
const awardApprovalHash = textHash("award-approval-proof");
const contractHash = textHash("signed-contract-proof");

describe("Phase 8 lifecycle proof expansion", () => {
  it("emits relayer-only proof events for the secure proposal lifecycle", async () => {
    const { relayer, auditLog } = await deployContracts();

    await expect(
      auditLog
        .connect(relayer)
        .recordTenderManifestCommitted(tenderId, procurementEmployeeHash, procurementRole, documentHash, metadataHash)
    )
      .to.emit(auditLog, "LifecycleProofRecorded")
      .withArgs(
        tenderKey(tenderId),
        tenderId,
        "TENDER_MANIFEST_COMMITTED",
        procurementEmployeeHash,
        procurementRole,
        documentHash,
        "TENDER_MANIFEST",
        metadataHash,
        anyValue
      );

    await expect(
      auditLog.connect(relayer).recordTenderPublished(tenderId, procurementEmployeeHash, procurementRole, documentHash, metadataHash)
    )
      .to.emit(auditLog, "LifecycleProofRecorded")
      .withArgs(
        tenderKey(tenderId),
        tenderId,
        "TENDER_PUBLISHED",
        procurementEmployeeHash,
        procurementRole,
        documentHash,
        "TENDER_MANIFEST",
        metadataHash,
        anyValue
      );

    await expect(
      auditLog.connect(relayer).recordProposalPackageSubmitted(tenderId, vendorEmployeeHash, vendorRole, packageHash, metadataHash)
    )
      .to.emit(auditLog, "LifecycleProofRecorded")
      .withArgs(
        tenderKey(tenderId),
        tenderId,
        "PROPOSAL_PACKAGE_SUBMITTED",
        vendorEmployeeHash,
        vendorRole,
        packageHash,
        "PROPOSAL_PACKAGE",
        metadataHash,
        anyValue
      );

    await expect(
      auditLog
        .connect(relayer)
        .recordProposalEnvelopeCommitted(tenderId, vendorEmployeeHash, vendorRole, "TECHNICAL", technicalEnvelopeHash, metadataHash)
    )
      .to.emit(auditLog, "LifecycleProofRecorded")
      .withArgs(
        tenderKey(tenderId),
        tenderId,
        "PROPOSAL_ENVELOPE_COMMITTED",
        vendorEmployeeHash,
        vendorRole,
        technicalEnvelopeHash,
        "TECHNICAL",
        metadataHash,
        anyValue
      );

    await expect(
      auditLog.connect(relayer).recordTenderClosed(tenderId, procurementEmployeeHash, procurementRole, closureHash, metadataHash)
    )
      .to.emit(auditLog, "LifecycleProofRecorded")
      .withArgs(
        tenderKey(tenderId),
        tenderId,
        "TENDER_CLOSED",
        procurementEmployeeHash,
        procurementRole,
        closureHash,
        "TENDER_CLOSE",
        metadataHash,
        anyValue
      );

    await expect(
      auditLog.connect(relayer).recordKeyReleaseLogged(tenderId, evaluatorEmployeeHash, evaluatorRole, "FINANCIAL", keyReleaseHash, metadataHash)
    )
      .to.emit(auditLog, "LifecycleProofRecorded")
      .withArgs(
        tenderKey(tenderId),
        tenderId,
        "KEY_RELEASE_LOGGED",
        evaluatorEmployeeHash,
        evaluatorRole,
        keyReleaseHash,
        "FINANCIAL",
        metadataHash,
        anyValue
      );

    await expect(
      auditLog
        .connect(relayer)
        .recordEvaluationReportCommitted(tenderId, evaluatorEmployeeHash, evaluatorRole, evaluationReportHash, metadataHash)
    )
      .to.emit(auditLog, "LifecycleProofRecorded")
      .withArgs(
        tenderKey(tenderId),
        tenderId,
        "EVALUATION_REPORT_COMMITTED",
        evaluatorEmployeeHash,
        evaluatorRole,
        evaluationReportHash,
        "EVALUATION_REPORT",
        metadataHash,
        anyValue
      );

    await expect(
      auditLog.connect(relayer).recordAwardRecommended(tenderId, evaluatorEmployeeHash, evaluatorRole, recommendationHash, metadataHash)
    )
      .to.emit(auditLog, "LifecycleProofRecorded")
      .withArgs(
        tenderKey(tenderId),
        tenderId,
        "AWARD_RECOMMENDED",
        evaluatorEmployeeHash,
        evaluatorRole,
        recommendationHash,
        "AWARD_RECOMMENDATION",
        metadataHash,
        anyValue
      );

    await expect(
      auditLog.connect(relayer).recordAwardApproved(tenderId, financeEmployeeHash, financeRole, awardApprovalHash, metadataHash)
    )
      .to.emit(auditLog, "LifecycleProofRecorded")
      .withArgs(
        tenderKey(tenderId),
        tenderId,
        "AWARD_APPROVED",
        financeEmployeeHash,
        financeRole,
        awardApprovalHash,
        "AWARD_APPROVAL",
        metadataHash,
        anyValue
      );

    await expect(
      auditLog.connect(relayer).recordContractHashCommitted(tenderId, procurementEmployeeHash, procurementRole, contractHash, metadataHash)
    )
      .to.emit(auditLog, "LifecycleProofRecorded")
      .withArgs(
        tenderKey(tenderId),
        tenderId,
        "CONTRACT_HASH_COMMITTED",
        procurementEmployeeHash,
        procurementRole,
        contractHash,
        "CONTRACT_HASH",
        metadataHash,
        anyValue
      );
  });

  it("blocks unauthorized addresses from recording expanded lifecycle proofs", async () => {
    const { outsider, auditLog } = await deployContracts();

    await expect(
      auditLog
        .connect(outsider)
        .recordProposalEnvelopeCommitted(tenderId, vendorEmployeeHash, vendorRole, "FINANCIAL", financialEnvelopeHash, metadataHash)
    ).to.be.revertedWith("RELAYER_NOT_AUTHORIZED");
  });

  it("rejects empty subjects and records hashes instead of confidential proposal content", async () => {
    const { relayer, auditLog } = await deployContracts();

    await expect(
      auditLog.connect(relayer).recordProposalPackageSubmitted(tenderId, vendorEmployeeHash, vendorRole, ethers.ZeroHash, metadataHash)
    ).to.be.revertedWith("INVALID_SUBJECT_HASH");

    const tx = await auditLog
      .connect(relayer)
      .recordProposalEnvelopeCommitted(tenderId, vendorEmployeeHash, vendorRole, "FINANCIAL", financialEnvelopeHash, metadataHash);
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

    expect(eventText).to.contain(financialEnvelopeHash);
    expect(eventText).to.not.contain("financial proposal amount");
    expect(eventText).to.not.contain("VEND-001");
  });
});
