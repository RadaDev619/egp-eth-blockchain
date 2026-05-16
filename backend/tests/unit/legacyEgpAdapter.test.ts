import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../../src/types/domain.js";
import { permissions } from "../../src/types/domain.js";

const db = vi.hoisted(() => ({
  auditSeq: 0,
  tenders: [] as Array<Record<string, any>>,
  envelopes: [] as Array<Record<string, any>>,
  encryptedFileReferences: [] as Array<Record<string, any>>,
  legacyRecords: [] as Array<Record<string, any>>,
  blockchainTransactions: [] as Array<Record<string, any>>,
  auditLogs: [] as Array<Record<string, any>>,
  reset() {
    this.auditSeq = 0;
    this.tenders.length = 0;
    this.envelopes.length = 0;
    this.encryptedFileReferences.length = 0;
    this.legacyRecords.length = 0;
    this.blockchainTransactions.length = 0;
    this.auditLogs.length = 0;
    this.tenders.push({
      id: "tender-1",
      tenderCode: "TDR-LEGACY-001",
      agency: "Ministry of Finance",
      currentState: "OPEN_FOR_PROPOSALS",
      createdByEmployeeHash: "0xproc",
      createdByRole: "PROCUREMENT_OFFICER"
    });
    this.envelopes.push({
      id: "technical-envelope-1",
      proposalPackage: {
        tenderId: "tender-1"
      }
    });
  }
}));

vi.mock("../../src/utils/prisma.js", () => {
  const prisma = {
    $transaction: vi.fn(async (fn) => fn(prisma)),
    tender: {
      findUnique: vi.fn(async ({ where }) => db.tenders.find((tender) => tender.id === where.id) ?? null)
    },
    proposalEnvelope: {
      findFirst: vi.fn(async ({ where }) =>
        db.envelopes.find((envelope) => envelope.id === where.id && envelope.proposalPackage.tenderId === where.proposalPackage.tenderId) ??
        null
      )
    },
    encryptedFileReference: {
      findFirst: vi.fn(async ({ where }) =>
        db.encryptedFileReferences.find(
          (reference) =>
            reference.id === where.id &&
            (reference.tenderId === where.OR[0].tenderId || reference.proposalEnvelope?.proposalPackage?.tenderId === where.OR[1].proposalEnvelope.proposalPackage.tenderId)
        ) ?? null
      ),
      upsert: vi.fn(async ({ where, update, create }) => {
        const existing = db.encryptedFileReferences.find((reference) => reference.storageKey === where.storageKey);

        if (existing) {
          Object.assign(existing, update);
          return existing;
        }

        const reference = {
          id: `encrypted-reference-${db.encryptedFileReferences.length + 1}`,
          createdAt: new Date(),
          ...create
        };
        db.encryptedFileReferences.push(reference);
        return reference;
      })
    },
    legacyEgpRecord: {
      upsert: vi.fn(async ({ where, update, create }) => {
        const existing = db.legacyRecords.find((record) => record.legacyRecordId === where.legacyRecordId);

        if (existing) {
          Object.assign(existing, update);
          return {
            ...existing,
            encryptedFileReference: db.encryptedFileReferences.find((reference) => reference.id === existing.encryptedFileReferenceId) ?? null
          };
        }

        const record = {
          id: `legacy-record-${db.legacyRecords.length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...create
        };
        db.legacyRecords.push(record);
        return {
          ...record,
          encryptedFileReference: db.encryptedFileReferences.find((reference) => reference.id === record.encryptedFileReferenceId) ?? null
        };
      }),
      findMany: vi.fn(async ({ where = {} }) =>
        db.legacyRecords
          .filter(
            (record) =>
              (where.tenderId === undefined || record.tenderId === where.tenderId) &&
              (where.recordType === undefined || record.recordType === where.recordType) &&
              (where.trustLayerTxHash === undefined || record.trustLayerTxHash === where.trustLayerTxHash)
          )
          .map((record) => ({
            ...record,
            encryptedFileReference: db.encryptedFileReferences.find((reference) => reference.id === record.encryptedFileReferenceId) ?? null
          }))
      ),
      findFirst: vi.fn(async ({ where }) => {
        const record = db.legacyRecords.find(
          (candidate) => candidate.id === where.OR[0].id || candidate.legacyRecordId === where.OR[1].legacyRecordId
        );

        if (!record) {
          return null;
        }

        return {
          ...record,
          encryptedFileReference: db.encryptedFileReferences.find((reference) => reference.id === record.encryptedFileReferenceId) ?? null
        };
      })
    },
    blockchainTransaction: {
      findUnique: vi.fn(async ({ where }) =>
        db.blockchainTransactions.find((transaction) => transaction.txHash === where.txHash) ?? null
      ),
      create: vi.fn(async ({ data }) => {
        db.blockchainTransactions.push(data);
        return data;
      })
    },
    auditLog: {
      create: vi.fn(async ({ data }) => {
        const audit = { id: `audit-${++db.auditSeq}`, createdAt: new Date(), ...data };
        db.auditLogs.push(audit);
        return audit;
      })
    }
  };

  return { prisma };
});

const { getLegacyEgpRecord, ingestLegacyEgpRecord, listLegacyEgpRecords } = await import("../../src/services/legacyEgpAdapter.js");

const procurementOfficer: AuthenticatedUser = {
  userId: "proc-user",
  profileId: "profile-proc",
  holderDID: "did:key:proc",
  employmentId: "PROC-001",
  employeeHash: "0xproc",
  employer: "Ministry of Finance",
  position: "Procurement Officer",
  employmentType: "Regular",
  role: "PROCUREMENT_OFFICER",
  permissions: [permissions.MANAGE_LEGACY_EGP_SIMULATOR, permissions.VIEW_ASSIGNED_TENDERS]
};

const encryptedHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("legacyEgpAdapter", () => {
  beforeEach(() => {
    db.reset();
  });

  it("ingests simulator operational records with encrypted file references and trust-layer tx hashes", async () => {
    const record = await ingestLegacyEgpRecord(
      {
        tenderId: "tender-1",
        legacyRecordId: "legacy-record-1",
        recordType: "PROPOSAL_STORAGE",
        operation: "ENCRYPTED_TECHNICAL_ENVELOPE_STORED",
        operationalStatus: "ENCRYPTED_REFERENCE_ONLY",
        trustLayerTxHash: "0xmocklegacytx",
        blockchainStatus: "MOCK_CONFIRMED",
        encryptedFileReference: {
          proposalEnvelopeId: "technical-envelope-1",
          storageProvider: "egp-simulator",
          storageKey: "legacy/tender-1/technical.enc",
          encryptedFileHash: encryptedHash,
          contentType: "application/octet-stream",
          byteSize: 2048,
          originalFilename: "../technical-proposal.pdf.enc"
        },
        metadata: {
          simulatorOnly: true,
          plaintextStored: false
        }
      },
      procurementOfficer
    );

    expect(record).toMatchObject({
      sourceSystem: "EGP_SIMULATOR",
      legacyRecordId: "legacy-record-1",
      recordType: "PROPOSAL_STORAGE",
      trustLayerTxHash: "0xmocklegacytx",
      encryptedFileReference: expect.objectContaining({
        storageProvider: "egp-simulator",
        storageKey: "legacy/tender-1/technical.enc",
        encryptedFileHash: encryptedHash,
        originalFilename: "technical-proposal.pdf.enc"
      })
    });
    expect(db.blockchainTransactions).toContainEqual(
      expect.objectContaining({
        txHash: "0xmocklegacytx",
        action: "LEGACY_EGP_RECORD_LINKED",
        resourceType: "LEGACY_EGP_RECORD"
      })
    );
    expect(db.auditLogs.at(-1)).toMatchObject({
      action: "LEGACY_EGP_RECORD_LINKED",
      status: "SUCCESS",
      documentHash: encryptedHash
    });
    expect(JSON.stringify(record)).not.toContain("PROC-001");
  });

  it("rejects production e-GP source claims and plaintext metadata", async () => {
    await expect(
      ingestLegacyEgpRecord(
        {
          sourceSystem: "PRODUCTION_BHUTAN_EGP",
          tenderId: "tender-1",
          legacyRecordId: "legacy-record-prod",
          recordType: "TENDER_OPERATION",
          operation: "SYNCED",
          operationalStatus: "SYNCED"
        },
        procurementOfficer
      )
    ).rejects.toMatchObject({
      statusCode: 422,
      code: "VALIDATION_ERROR"
    });

    await expect(
      ingestLegacyEgpRecord(
        {
          tenderId: "tender-1",
          legacyRecordId: "legacy-record-plaintext",
          recordType: "DOCUMENT_REFERENCE",
          operation: "PLAINTEXT_UPLOAD",
          operationalStatus: "REJECTED",
          metadata: {
            proposalContent: "do not store this"
          }
        },
        procurementOfficer
      )
    ).rejects.toMatchObject({
      statusCode: 422,
      code: "VALIDATION_ERROR"
    });

    expect(db.legacyRecords).toHaveLength(0);
    expect(db.encryptedFileReferences).toHaveLength(0);
    expect(db.blockchainTransactions).toHaveLength(0);
    expect(db.auditLogs).toHaveLength(0);
  });

  it("lists and fetches legacy records without exposing metadata payloads", async () => {
    await ingestLegacyEgpRecord(
      {
        tenderId: "tender-1",
        legacyRecordId: "legacy-record-2",
        recordType: "AWARD_UPDATE",
        operation: "AWARD_APPROVAL_PROOF_LINKED",
        operationalStatus: "TRUST_LAYER_TX_REFERENCED",
        trustLayerTxHash: "0xmockawardlegacy",
        blockchainStatus: "MOCK_CONFIRMED",
        metadata: {
          internalOldSystemNote: "hidden from presenter"
        }
      },
      procurementOfficer
    );

    const records = await listLegacyEgpRecords({ tenderId: "tender-1" });
    const fetched = await getLegacyEgpRecord("legacy-record-2");

    expect(records).toHaveLength(1);
    expect(fetched).toMatchObject({
      legacyRecordId: "legacy-record-2",
      metadataHash: expect.stringMatching(/^0x[a-f0-9]{64}$/)
    });
    expect(JSON.stringify(records)).not.toContain("internalOldSystemNote");
  });
});
