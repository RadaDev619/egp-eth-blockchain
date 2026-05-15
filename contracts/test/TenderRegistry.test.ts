import { expect } from "chai";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import {
  amendedDocumentHash,
  bidHash,
  deployContracts,
  documentHash,
  metadataHash,
  procurementEmployeeHash,
  procurementRole,
  tenderId,
  tenderKey,
  vendorEmployeeHash,
  vendorRole
} from "./helpers";

describe("TenderRegistry", () => {
  it("lets an authorized backend relayer record tender creation", async () => {
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

    const tender = await tenderRegistry.getTender(tenderId);
    expect(tender.exists).to.equal(true);
    expect(tender.latestVersion).to.equal(1n);
    expect(tender.currentState).to.equal("CREATED");
  });

  it("blocks unauthorized addresses from recording tender creation", async () => {
    const { outsider, tenderRegistry } = await deployContracts();

    await expect(
      tenderRegistry
        .connect(outsider)
        .recordTenderCreated(tenderId, procurementEmployeeHash, procurementRole, documentHash, "ipfs://doc-v1", metadataHash)
    ).to.be.revertedWith("RELAYER_NOT_AUTHORIZED");
  });

  it("records tender versions without overwriting the original version", async () => {
    const { relayer, tenderRegistry } = await deployContracts();

    await tenderRegistry
      .connect(relayer)
      .recordTenderCreated(tenderId, procurementEmployeeHash, procurementRole, documentHash, "ipfs://doc-v1", metadataHash);

    await expect(
      tenderRegistry
        .connect(relayer)
        .recordTenderVersionCreated(
          tenderId,
          2,
          procurementEmployeeHash,
          procurementRole,
          amendedDocumentHash,
          "ipfs://doc-v2",
          metadataHash
        )
    )
      .to.emit(tenderRegistry, "TenderVersionCreated")
      .withArgs(
        tenderKey(tenderId),
        tenderId,
        2,
        procurementEmployeeHash,
        procurementRole,
        amendedDocumentHash,
        "ipfs://doc-v2",
        metadataHash,
        anyValue
      );

    const tender = await tenderRegistry.getTender(tenderId);
    expect(tender.latestVersion).to.equal(2n);
    expect(tender.latestDocumentHash).to.equal(amendedDocumentHash);
  });

  it("records bid submission events from the relayer", async () => {
    const { relayer, tenderRegistry } = await deployContracts();

    await tenderRegistry
      .connect(relayer)
      .recordTenderCreated(tenderId, procurementEmployeeHash, procurementRole, documentHash, "ipfs://doc-v1", metadataHash);

    await expect(
      tenderRegistry.connect(relayer).recordBidSubmitted(tenderId, vendorEmployeeHash, vendorRole, bidHash, metadataHash)
    )
      .to.emit(tenderRegistry, "BidSubmitted")
      .withArgs(tenderKey(tenderId), tenderId, vendorEmployeeHash, vendorRole, bidHash, metadataHash, anyValue);

    const tender = await tenderRegistry.getTender(tenderId);
    expect(tender.currentState).to.equal("BID_SUBMITTED");
  });

  it("does not emit raw Employment ID in tender events", async () => {
    const { relayer, tenderRegistry } = await deployContracts();

    const tx = await tenderRegistry
      .connect(relayer)
      .recordTenderCreated(tenderId, procurementEmployeeHash, procurementRole, documentHash, "ipfs://doc-v1", metadataHash);
    const receipt = await tx.wait();
    const parsedLogs = receipt.logs
      .map((log: unknown) => {
        try {
          return tenderRegistry.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const eventText = parsedLogs.map((event: any) => event.args.join(" ")).join(" ");
    expect(eventText).to.not.contain("PROC-001");
    expect(eventText).to.contain(procurementEmployeeHash);
  });
});
