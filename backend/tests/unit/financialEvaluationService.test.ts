import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../../src/types/domain.js";
import { permissions } from "../../src/types/domain.js";

const db = vi.hoisted(() => ({
  auditSeq: 0,
  tenders: [] as Array<Record<string, unknown>>,
  declarations: [] as Array<Record<string, unknown>>,
  envelopes: [] as Array<Record<string, unknown>>,
  fileReferences: [] as Array<Record<string, unknown>>,
  keyReleaseRequests: [] as Array<Record<string, unknown>>,
  auditLogs: [] as Array<Record<string, unknown>>,
  reset() {
    this.auditSeq = 0;
    this.tenders.length = 0;
    this.declarations.length = 0;
    this.envelopes.length = 0;
    this.fileReferences.length = 0;
    this.keyReleaseRequests.length = 0;
    this.auditLogs.length = 0;
  }
}));

const gatewayMocks = vi.hoisted(() => ({
  assertSecureGatewayAction: vi.fn(async () => ({
    decision: {
      tender: db.tenders[0],
      assignment: {
        id: "assignment-tec-chair",
        stakeholderId: "stakeholder-tec-chair"
      }
    },
    policy: {},
    metadataHash: "0xmetadata",
    metadata: {}
  })),
  SecureGatewayAction: {
    REQUEST_KEY_RELEASE: "REQUEST_KEY_RELEASE"
  }
}));

const keyManagementMocks = vi.hoisted(() => ({
  requestEnvelopeKeyRelease: vi.fn(async ({ proposalEnvelopeId }) => ({
    request: {
      id: "key-release-request-1",
      proposalEnvelopeId,
      status: "REQUESTED"
    },
    keyMaterialReference: null
  })),
  releaseEnvelopeKey: vi.fn(async ({ keyReleaseRequestId }) => ({
    request: {
      id: keyReleaseRequestId,
      status: "APPROVED"
    },
    envelopeType: "FINANCIAL",
    keyMaterialReference: "kms://mock/releases/financial-envelope"
  }))
}));

function financialEnvelopeWithRelations(envelope: Record<string, unknown>) {
  return {
    ...envelope,
    proposalPackage: envelope.proposalPackage as Record<string, unknown>,
    fileReferences: db.fileReferences.filter((file) => file.proposalEnvelopeId === envelope.id),
    keyReleaseRequests: db.keyReleaseRequests.filter((request) => request.proposalEnvelopeId === envelope.id)
  };
}

vi.mock("../../src/services/secureProcurementGateway.js", () => gatewayMocks);
vi.mock("../../src/services/keyManagementService.js", () => keyManagementMocks);

vi.mock("../../src/utils/prisma.js", () => {
  const prisma = {
    tender: {
      findUnique: vi.fn(async ({ where }) => db.tenders.find((tender) => tender.id === where.id) ?? null)
    },
    conflictOfInterestDeclaration: {
      findUnique: vi.fn(async ({ where }) => {
        const compound = where.tenderId_actorEmployeeHash;
        return (
          db.declarations.find(
            (declaration) =>
              declaration.tenderId === compound.tenderId && declaration.actorEmployeeHash === compound.actorEmployeeHash
          ) ?? null
        );
      })
    },
    proposalEnvelope: {
      findMany: vi.fn(async () =>
        db.envelopes.filter((envelope) => envelope.envelopeType === "FINANCIAL").map(financialEnvelopeWithRelations)
      ),
      findFirst: vi.fn(async ({ where }) => {
        const envelope = db.envelopes.find(
          (candidate) => candidate.id === where.id && candidate.envelopeType === "FINANCIAL"
        );

        if (!envelope) {
          return null;
        }

        return {
          ...envelope,
          proposalPackage: envelope.proposalPackage
        };
      })
    },
    keyReleaseRequest: {
      findFirst: vi.fn(async ({ where }) => {
        const request = db.keyReleaseRequests.find((candidate) => candidate.id === where.id && candidate.tenderId === where.tenderId);
        const envelope = db.envelopes.find((candidate) => candidate.id === request?.proposalEnvelopeId);

        if (!request || envelope?.envelopeType !== "FINANCIAL") {
          return null;
        }

        return {
          ...request,
          proposalEnvelope: envelope
        };
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

const { getFinancialEvaluationWorkspace, releaseFinancialEnvelopeKey, requestFinancialEnvelopeKeyRelease } = await import(
  "../../src/services/financialEvaluationService.js"
);

const tecChair: AuthenticatedUser = {
  userId: "tec-chair-user",
  profileId: "profile-tec-chair",
  holderDID: "did:key:tec-chair",
  employmentId: "TEC-CHAIR-001",
  employeeHash: "0xtecchair",
  employer: "Evaluation Committee",
  position: "TEC Chair",
  employmentType: "Regular",
  role: "TEC_CHAIR",
  permissions: [
    permissions.VIEW_ASSIGNED_TENDERS,
    permissions.DECLARE_CONFLICT_OF_INTEREST,
    permissions.REQUEST_KEY_RELEASE,
    permissions.RELEASE_ENVELOPE_KEY,
    permissions.SUBMIT_EVALUATION_REPORT
  ]
};

function seedTender(currentState: string) {
  db.tenders.push({
    id: "tender-1",
    tenderCode: "TDR-FIN-001",
    currentState,
    createdByEmployeeHash: "0xproc",
    createdByRole: "PROCUREMENT_OFFICER"
  });
}

function seedFinancialEnvelope() {
  const envelope = {
    id: "financial-envelope-1",
    proposalPackageId: "proposal-package-1",
    envelopeType: "FINANCIAL",
    encryptedFileHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    envelopeManifestHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    encryptionAlgorithm: "AES-GCM",
    keyId: null,
    storageReference: "mock-storage/financial.enc",
    ipfsCid: null,
    txHash: "0xmockfinancial",
    blockchainStatus: "MOCK_CONFIRMED",
    createdAt: new Date(),
    updatedAt: new Date(),
    proposalPackage: {
      id: "proposal-package-1",
      tenderId: "tender-1",
      vendorStakeholder: {
        id: "vendor-stakeholder-1",
        displayName: "Demo Vendor"
      }
    }
  };
  db.envelopes.push(envelope);
  db.fileReferences.push({
    id: "file-reference-1",
    proposalEnvelopeId: envelope.id,
    storageProvider: "mock-browser-encrypted",
    storageKey: "mock-storage/financial.enc",
    encryptedFileHash: envelope.encryptedFileHash,
    contentType: "application/octet-stream",
    byteSize: 1024,
    originalFilename: "financial.pdf.enc",
    encryptionAlgorithm: "AES-GCM",
    createdAt: new Date()
  });
  db.keyReleaseRequests.push({
    id: "key-release-request-1",
    tenderId: "tender-1",
    proposalEnvelopeId: envelope.id,
    requesterEmployeeHash: "0xtecchair",
    requesterRole: "TEC_CHAIR",
    status: "REQUESTED"
  });

  return envelope;
}

describe("financialEvaluationService", () => {
  beforeEach(() => {
    db.reset();
    gatewayMocks.assertSecureGatewayAction.mockClear();
    keyManagementMocks.requestEnvelopeKeyRelease.mockClear();
    keyManagementMocks.releaseEnvelopeKey.mockClear();
  });

  it("blocks premature financial envelope access before technical completion and logs it", async () => {
    seedTender("TECHNICAL_EVALUATION");
    seedFinancialEnvelope();

    await expect(getFinancialEvaluationWorkspace("tender-1", tecChair)).rejects.toMatchObject({
      statusCode: 409,
      code: "INVALID_TRANSITION"
    });

    expect(gatewayMocks.assertSecureGatewayAction).not.toHaveBeenCalled();
    expect(keyManagementMocks.requestEnvelopeKeyRelease).not.toHaveBeenCalled();
    expect(db.auditLogs.at(-1)).toMatchObject({
      action: "FINANCIAL_ENVELOPE_ACCESS_BLOCKED",
      status: "BLOCKED",
      rejectionReason: "FINANCIAL_EVALUATION_NOT_STARTED"
    });
  });

  it("lists financial envelopes only after the tender reaches financial evaluation", async () => {
    seedTender("FINANCIAL_EVALUATION");
    seedFinancialEnvelope();

    const workspace = await getFinancialEvaluationWorkspace("tender-1", tecChair);

    expect(workspace.tender).toMatchObject({
      id: "tender-1",
      currentState: "FINANCIAL_EVALUATION"
    });
    expect(workspace.envelopes).toHaveLength(1);
    expect(workspace.envelopes[0]).toMatchObject({
      id: "financial-envelope-1",
      envelopeType: "FINANCIAL",
      encryptedFileHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      fileReferences: [
        expect.objectContaining({
          storageKey: "mock-storage/financial.enc",
          originalFilename: "financial.pdf.enc"
        })
      ]
    });
    expect(JSON.stringify(workspace)).not.toContain("financial proposal amount");
    expect(JSON.stringify(workspace)).not.toContain("TEC-CHAIR-001");
  });

  it("allows financial key release request and release after technical completion", async () => {
    seedTender("FINANCIAL_EVALUATION");
    seedFinancialEnvelope();

    const requested = await requestFinancialEnvelopeKeyRelease(
      {
        tenderId: "tender-1",
        proposalEnvelopeId: "financial-envelope-1"
      },
      tecChair
    );
    const released = await releaseFinancialEnvelopeKey(
      {
        tenderId: "tender-1",
        keyReleaseRequestId: "key-release-request-1"
      },
      tecChair
    );

    expect(requested.request).toMatchObject({
      proposalEnvelopeId: "financial-envelope-1",
      status: "REQUESTED"
    });
    expect(released).toMatchObject({
      envelopeType: "FINANCIAL",
      keyMaterialReference: "kms://mock/releases/financial-envelope"
    });
    expect(keyManagementMocks.requestEnvelopeKeyRelease).toHaveBeenCalledTimes(1);
    expect(keyManagementMocks.releaseEnvelopeKey).toHaveBeenCalledTimes(1);
  });
});
