import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../../src/types/domain.js";
import { permissions } from "../../src/types/domain.js";

const db = vi.hoisted(() => ({
  auditSeq: 0,
  declarationSeq: 0,
  reportSeq: 0,
  blockchainSeq: 0,
  transitionSeq: 0,
  tenders: [] as Array<Record<string, unknown>>,
  declarations: [] as Array<Record<string, unknown>>,
  reports: [] as Array<Record<string, unknown>>,
  envelopes: [] as Array<Record<string, unknown>>,
  fileReferences: [] as Array<Record<string, unknown>>,
  keyReleaseRequests: [] as Array<Record<string, unknown>>,
  blockchainTransactions: [] as Array<Record<string, unknown>>,
  publicAuditProofs: [] as Array<Record<string, unknown>>,
  transitions: [] as Array<Record<string, unknown>>,
  auditLogs: [] as Array<Record<string, unknown>>,
  reset() {
    this.auditSeq = 0;
    this.declarationSeq = 0;
    this.reportSeq = 0;
    this.blockchainSeq = 0;
    this.transitionSeq = 0;
    this.tenders.length = 0;
    this.declarations.length = 0;
    this.reports.length = 0;
    this.envelopes.length = 0;
    this.fileReferences.length = 0;
    this.keyReleaseRequests.length = 0;
    this.blockchainTransactions.length = 0;
    this.publicAuditProofs.length = 0;
    this.transitions.length = 0;
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
    DECLARE_CONFLICT_OF_INTEREST: "DECLARE_CONFLICT_OF_INTEREST",
    REQUEST_KEY_RELEASE: "REQUEST_KEY_RELEASE",
    SUBMIT_EVALUATION_REPORT: "SUBMIT_EVALUATION_REPORT"
  }
}));

const relayerMocks = vi.hoisted(() => ({
  recordEvaluationReportCommitted: vi.fn(async () => ({
    txHash: "0xmockevaluationreport00000000000000000000000000000000000000000000",
    status: "MOCK_CONFIRMED",
    network: "mock",
    blockNumber: 0,
    chainId: 31337,
    contractAddress: "mock-contract",
    relayerAddress: "mock-relayer",
    explorerUrl: null,
    mock: true
  }))
}));

function technicalEnvelopeWithRelations(envelope: Record<string, unknown>) {
  const proposalPackage = envelope.proposalPackage as Record<string, unknown>;

  return {
    ...envelope,
    proposalPackage,
    fileReferences: db.fileReferences.filter((file) => file.proposalEnvelopeId === envelope.id),
    keyReleaseRequests: db.keyReleaseRequests.filter((request) => request.proposalEnvelopeId === envelope.id)
  };
}

vi.mock("../../src/services/secureProcurementGateway.js", () => gatewayMocks);
vi.mock("../../src/services/relayer.js", () => ({
  recordEvaluationReportCommitted: relayerMocks.recordEvaluationReportCommitted
}));

vi.mock("../../src/utils/prisma.js", () => {
  const prisma = {
    tender: {
      findUnique: vi.fn(async ({ where }) => db.tenders.find((tender) => tender.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }) => {
        const tender = db.tenders.find((candidate) => candidate.id === where.id);

        if (!tender) {
          throw new Error("Tender not found.");
        }

        Object.assign(tender, data);
        return tender;
      })
    },
    tenderRoleAssignment: {
      findMany: vi.fn(async () => [])
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
      }),
      findMany: vi.fn(async ({ where }) =>
        db.declarations.filter((declaration) => !where?.tenderId || declaration.tenderId === where.tenderId)
      ),
      upsert: vi.fn(async ({ where, update, create }) => {
        const compound = where.tenderId_actorEmployeeHash;
        let declaration = db.declarations.find(
          (candidate) => candidate.tenderId === compound.tenderId && candidate.actorEmployeeHash === compound.actorEmployeeHash
        );

        if (declaration) {
          Object.assign(declaration, update);
        } else {
          const createdDeclaration = {
            id: `declaration-${++db.declarationSeq}`,
            createdAt: new Date(),
            ...create
          };
          db.declarations.push(createdDeclaration);
          declaration = createdDeclaration;
        }

        return declaration;
      })
    },
    proposalEnvelope: {
      count: vi.fn(async () => db.envelopes.filter((envelope) => envelope.envelopeType === "TECHNICAL").length),
      findMany: vi.fn(async () =>
        db.envelopes.filter((envelope) => envelope.envelopeType === "TECHNICAL").map(technicalEnvelopeWithRelations)
      )
    },
    evaluationReport: {
      findMany: vi.fn(async ({ where }) => db.reports.filter((report) => !where?.tenderId || report.tenderId === where.tenderId)),
      findFirst: vi.fn(async ({ where }) =>
        db.reports.find((report) => report.id === where.id && report.tenderId === where.tenderId) ?? null
      ),
      upsert: vi.fn(async ({ where, update, create }) => {
        const compound = where.tenderId_reportHash;
        let report = db.reports.find(
          (candidate) => candidate.tenderId === compound.tenderId && candidate.reportHash === compound.reportHash
        );

        if (report) {
          Object.assign(report, update);
        } else {
          const createdReport = {
            id: `report-${++db.reportSeq}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...create
          };
          db.reports.push(createdReport);
          report = createdReport;
        }

        return report;
      }),
      update: vi.fn(async ({ where, data }) => {
        const report = db.reports.find((candidate) => candidate.id === where.id);

        if (!report) {
          throw new Error("Report not found.");
        }

        Object.assign(report, data, { updatedAt: new Date() });
        return report;
      })
    },
    blockchainTransaction: {
      create: vi.fn(async ({ data }) => {
        const transaction = { id: `blockchain-${++db.blockchainSeq}`, createdAt: new Date(), ...data };
        db.blockchainTransactions.push(transaction);
        return transaction;
      })
    },
    publicAuditProof: {
      upsert: vi.fn(async ({ where, update, create }) => {
        const compound = where.tenderId_proofType_proofHash;
        let proof = db.publicAuditProofs.find(
          (candidate) =>
            candidate.tenderId === compound.tenderId &&
            candidate.proofType === compound.proofType &&
            candidate.proofHash === compound.proofHash
        );

        if (proof) {
          Object.assign(proof, update);
        } else {
          const createdProof = { id: `proof-${db.publicAuditProofs.length + 1}`, createdAt: new Date(), ...create };
          db.publicAuditProofs.push(createdProof);
          proof = createdProof;
        }

        return proof;
      })
    },
    procurementTransition: {
      create: vi.fn(async ({ data }) => {
        const transition = { id: `transition-${++db.transitionSeq}`, createdAt: new Date(), ...data };
        db.transitions.push(transition);
        return transition;
      })
    },
    auditLog: {
      create: vi.fn(async ({ data }) => {
        const audit = { id: `audit-${++db.auditSeq}`, createdAt: new Date(), ...data };
        db.auditLogs.push(audit);
        return audit;
      })
    },
    $transaction: vi.fn(async (callback) => callback(prisma))
  };

  return { prisma };
});

const {
  declareConflictOfInterest,
  finalizeEvaluationReport,
  listTechnicalEnvelopesForCommittee,
  submitEvaluationReport
} = await import("../../src/services/evaluationCommitteeService.js");

const validHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const technicalHash = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

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
    permissions.SUBMIT_EVALUATION_REPORT
  ]
};

function seedTender(currentState = "TECHNICAL_EVALUATION") {
  db.tenders.push({
    id: "tender-1",
    tenderCode: "TDR-COMMITTEE-001",
    currentState,
    createdByEmployeeHash: "0xproc",
    createdByRole: "PROCUREMENT_OFFICER"
  });
}

describe("evaluationCommitteeService", () => {
  beforeEach(() => {
    db.reset();
    gatewayMocks.assertSecureGatewayAction.mockClear();
    relayerMocks.recordEvaluationReportCommitted.mockClear();
  });

  it("records a committee conflict declaration as a hash-only audit event", async () => {
    seedTender();

    const declaration = await declareConflictOfInterest(
      {
        tenderId: "tender-1",
        declarationStatus: "DECLARED_NO_CONFLICT",
        declarationHash: validHash
      },
      tecChair
    );

    expect(declaration).toMatchObject({
      tenderId: "tender-1",
      actorEmployeeHash: "0xtecchair",
      actorRole: "TEC_CHAIR",
      declarationStatus: "DECLARED_NO_CONFLICT",
      declarationHash: validHash
    });
    expect(db.auditLogs.at(-1)).toMatchObject({
      action: "CONFLICT_OF_INTEREST_DECLARED",
      status: "SUCCESS",
      documentHash: validHash
    });
    expect(JSON.stringify(db.auditLogs)).not.toContain("TEC-CHAIR-001");
  });

  it("blocks technical envelope access when a committee member has declared conflict", async () => {
    seedTender();
    db.declarations.push({
      id: "declaration-1",
      tenderId: "tender-1",
      actorEmployeeHash: "0xtecchair",
      actorRole: "TEC_CHAIR",
      declarationStatus: "DECLARED_CONFLICT",
      declarationHash: validHash
    });

    await expect(listTechnicalEnvelopesForCommittee("tender-1", tecChair)).rejects.toMatchObject({
      statusCode: 403,
      code: "AUTHORIZATION_ERROR"
    });

    expect(gatewayMocks.assertSecureGatewayAction).not.toHaveBeenCalled();
    expect(db.auditLogs.at(-1)).toMatchObject({
      action: "COMMITTEE_ACTION_BLOCKED",
      status: "BLOCKED",
      rejectionReason: "CONFLICT_OF_INTEREST_DECLARED"
    });
  });

  it("lets the TEC chair submit and finalize an evaluation report with relayer proof", async () => {
    seedTender();
    db.declarations.push({
      id: "declaration-1",
      tenderId: "tender-1",
      actorEmployeeHash: "0xtecchair",
      actorRole: "TEC_CHAIR",
      declarationStatus: "DECLARED_NO_CONFLICT",
      declarationHash: validHash
    });

    const report = await submitEvaluationReport(
      {
        tenderId: "tender-1",
        reportHash: validHash,
        technicalScoreHash: technicalHash
      },
      tecChair
    );
    expect(report).toMatchObject({
      status: "SUBMITTED",
      submittedByRole: "TEC_CHAIR",
      reportHash: validHash,
      technicalScoreHash: technicalHash
    });

    const finalized = await finalizeEvaluationReport({ tenderId: "tender-1", reportId: String(report.id) }, tecChair);

    expect(finalized).toMatchObject({
      status: "FINALIZED",
      txHash: "0xmockevaluationreport00000000000000000000000000000000000000000000",
      blockchainStatus: "MOCK_CONFIRMED"
    });
    expect(relayerMocks.recordEvaluationReportCommitted).toHaveBeenCalledTimes(1);
    expect(relayerMocks.recordEvaluationReportCommitted).toHaveBeenCalledWith(
      expect.objectContaining({
        tenderId: "tender-1",
        actorRole: "TEC_CHAIR",
        reportHash: validHash,
        toState: "FINANCIAL_EVALUATION"
      })
    );
    expect(db.tenders[0].currentState).toBe("FINANCIAL_EVALUATION");
    expect(db.blockchainTransactions).toContainEqual(
      expect.objectContaining({
        action: "EVALUATION_REPORT_COMMITTED",
        resourceType: "EVALUATION_REPORT"
      })
    );
    expect(db.publicAuditProofs).toContainEqual(
      expect.objectContaining({
        proofType: "EVALUATION_REPORT",
        proofHash: validHash
      })
    );
    expect(db.auditLogs.map((audit) => audit.action)).toEqual([
      "EVALUATION_REPORT_SUBMITTED",
      "EVALUATION_REPORT_FINALIZED"
    ]);
  });
});
