import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../../src/types/domain.js";
import { permissions } from "../../src/types/domain.js";

const db = vi.hoisted(() => ({
  auditSeq: 0,
  tenders: [] as Array<Record<string, any>>,
  manifests: [] as Array<Record<string, any>>,
  reports: [] as Array<Record<string, any>>,
  stakeholders: [] as Array<Record<string, any>>,
  recommendations: [] as Array<Record<string, any>>,
  approvals: [] as Array<Record<string, any>>,
  blockchainTransactions: [] as Array<Record<string, any>>,
  publicAuditProofs: [] as Array<Record<string, any>>,
  transitions: [] as Array<Record<string, any>>,
  auditLogs: [] as Array<Record<string, any>>,
  reset() {
    this.auditSeq = 0;
    this.tenders.length = 0;
    this.manifests.length = 0;
    this.reports.length = 0;
    this.stakeholders.length = 0;
    this.recommendations.length = 0;
    this.approvals.length = 0;
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
        id: "assignment-1",
        stakeholderId: "stakeholder-assignment-1"
      }
    },
    policy: {},
    metadataHash: "0xmetadata",
    metadata: {}
  })),
  SecureGatewayAction: {
    SUBMIT_AWARD_RECOMMENDATION: "SUBMIT_AWARD_RECOMMENDATION",
    APPROVE_AWARD: "APPROVE_AWARD",
    COMMIT_CONTRACT_HASH: "COMMIT_CONTRACT_HASH"
  }
}));

const relayerMocks = vi.hoisted(() => ({
  recordAwardRecommended: vi.fn(async () => ({
    txHash: "0xmockawardrecommended0000000000000000000000000000000000000000",
    status: "MOCK_CONFIRMED",
    network: "mock",
    blockNumber: 0,
    chainId: 31337,
    contractAddress: "mock-contract",
    relayerAddress: "mock-relayer",
    explorerUrl: null,
    mock: true
  })),
  recordAwardApproved: vi.fn(async () => ({
    txHash: "0xmockawardapproved00000000000000000000000000000000000000000000",
    status: "MOCK_CONFIRMED",
    network: "mock",
    blockNumber: 0,
    chainId: 31337,
    contractAddress: "mock-contract",
    relayerAddress: "mock-relayer",
    explorerUrl: null,
    mock: true
  })),
  recordContractHashCommitted: vi.fn(async () => ({
    txHash: "0xmockcontracthash000000000000000000000000000000000000000000000",
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

vi.mock("../../src/services/secureProcurementGateway.js", () => gatewayMocks);
vi.mock("../../src/services/relayer.js", () => relayerMocks);

vi.mock("../../src/utils/prisma.js", () => {
  const prisma = {
    $transaction: vi.fn(async (fn) => fn(prisma)),
    tender: {
      findUnique: vi.fn(async ({ where }) => db.tenders.find((tender) => tender.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }) => {
        const tender = db.tenders.find((candidate) => candidate.id === where.id);
        if (!tender) {
          throw new Error("Tender not found in awardService test mock.");
        }
        Object.assign(tender, data);
        return tender;
      })
    },
    tenderManifest: {
      findFirst: vi.fn(async ({ where }) => db.manifests.find((manifest) => manifest.tenderId === where.tenderId) ?? null)
    },
    evaluationReport: {
      findFirst: vi.fn(async ({ where }) =>
        db.reports.find(
          (report) =>
            (where.id === undefined || report.id === where.id) &&
            report.tenderId === where.tenderId &&
            (where.status === undefined || report.status === where.status)
        ) ?? null
      )
    },
    stakeholder: {
      findUnique: vi.fn(async ({ where }) => db.stakeholders.find((stakeholder) => stakeholder.id === where.id) ?? null)
    },
    awardRecommendation: {
      findMany: vi.fn(async () => db.recommendations),
      findFirst: vi.fn(async ({ where }) => {
        const recommendation =
          db.recommendations.find((candidate) => candidate.id === where.id && candidate.tenderId === where.tenderId) ?? null;

        if (!recommendation) {
          return null;
        }

        return {
          ...recommendation,
          approvals: db.approvals.filter((approval) => approval.awardRecommendationId === recommendation.id)
        };
      }),
      upsert: vi.fn(async ({ where, update, create }) => {
        const key = where.tenderId_recommendationHash;
        const existingRecommendation = db.recommendations.find(
          (candidate) => candidate.tenderId === key.tenderId && candidate.recommendationHash === key.recommendationHash
        );

        if (existingRecommendation) {
          Object.assign(existingRecommendation, update);
          return existingRecommendation;
        }

        const recommendation = { id: "award-recommendation-1", createdAt: new Date(), updatedAt: new Date(), ...create };
        db.recommendations.push(recommendation);
        return recommendation;
      }),
      update: vi.fn(async ({ where, data }) => {
        const recommendation = db.recommendations.find((candidate) => candidate.id === where.id);
        if (!recommendation) {
          throw new Error("Award recommendation not found in awardService test mock.");
        }
        Object.assign(recommendation, data);
        return recommendation;
      })
    },
    awardApproval: {
      upsert: vi.fn(async ({ where, update, create }) => {
        const key = where.awardRecommendationId_approverEmployeeHash;
        const existingApproval = db.approvals.find(
          (candidate) =>
            candidate.awardRecommendationId === key.awardRecommendationId &&
            candidate.approverEmployeeHash === key.approverEmployeeHash
        );

        if (existingApproval) {
          Object.assign(existingApproval, update);
          return existingApproval;
        }

        const approval = { id: `award-approval-${db.approvals.length + 1}`, createdAt: new Date(), ...create };
        db.approvals.push(approval);
        return approval;
      }),
      count: vi.fn(async ({ where }) =>
        db.approvals.filter(
          (approval) => approval.awardRecommendationId === where.awardRecommendationId && approval.decision === where.decision
        ).length
      )
    },
    blockchainTransaction: {
      create: vi.fn(async ({ data }) => {
        db.blockchainTransactions.push(data);
        return data;
      })
    },
    publicAuditProof: {
      findMany: vi.fn(async () => db.publicAuditProofs),
      upsert: vi.fn(async ({ where, update, create }) => {
        const key = where.tenderId_proofType_proofHash;
        const existingProof = db.publicAuditProofs.find(
          (candidate) =>
            candidate.tenderId === key.tenderId && candidate.proofType === key.proofType && candidate.proofHash === key.proofHash
        );

        if (existingProof) {
          Object.assign(existingProof, update);
          return existingProof;
        }

        const proof = { id: `public-proof-${db.publicAuditProofs.length + 1}`, createdAt: new Date(), ...create };
        db.publicAuditProofs.push(proof);
        return proof;
      })
    },
    procurementTransition: {
      create: vi.fn(async ({ data }) => {
        db.transitions.push(data);
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

const { approveAward, commitContractProofs, submitAwardRecommendation } = await import("../../src/services/awardService.js");

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
  permissions: [permissions.SUBMIT_AWARD_RECOMMENDATION]
};

const approvingOfficerOne: AuthenticatedUser = {
  userId: "approver-one-user",
  profileId: "profile-approver-one",
  holderDID: "did:key:approver-one",
  employmentId: "APP-001",
  employeeHash: "0xapproverone",
  employer: "Ministry of Finance",
  position: "Approving Officer",
  employmentType: "Regular",
  role: "APPROVING_OFFICER",
  permissions: [permissions.APPROVE_AWARD, permissions.VIEW_ASSIGNED_TENDERS]
};

const approvingOfficerTwo: AuthenticatedUser = {
  ...approvingOfficerOne,
  userId: "approver-two-user",
  profileId: "profile-approver-two",
  holderDID: "did:key:approver-two",
  employmentId: "APP-002",
  employeeHash: "0xapprovertwo"
};

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
  permissions: [permissions.COMMIT_CONTRACT_HASH, permissions.VIEW_ASSIGNED_TENDERS]
};

const hashA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const hashB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const hashC = "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

function seedBaseTender(currentState = "FINANCIAL_EVALUATION") {
  db.tenders.push({
    id: "tender-1",
    tenderCode: "TDR-AWARD-001",
    currentState,
    createdByEmployeeHash: "0xproc",
    createdByRole: "PROCUREMENT_OFFICER"
  });
  db.manifests.push({
    id: "manifest-1",
    tenderId: "tender-1",
    versionNumber: 1,
    status: "ACTIVE",
    approvalPolicy: {
      awardApprovalThreshold: 2
    }
  });
  db.stakeholders.push({
    id: "vendor-stakeholder-1",
    stakeholderType: "VENDOR",
    displayName: "Demo Vendor"
  });
  db.reports.push({
    id: "evaluation-report-1",
    tenderId: "tender-1",
    reportHash: hashA,
    status: "FINALIZED"
  });
}

describe("awardService", () => {
  beforeEach(() => {
    db.reset();
    gatewayMocks.assertSecureGatewayAction.mockClear();
    relayerMocks.recordAwardRecommended.mockClear();
    relayerMocks.recordAwardApproved.mockClear();
    relayerMocks.recordContractHashCommitted.mockClear();
  });

  it("submits an award recommendation hash and moves the tender to award recommended", async () => {
    seedBaseTender();

    const recommendation = await submitAwardRecommendation(
      {
        tenderId: "tender-1",
        evaluationReportId: "evaluation-report-1",
        recommendedVendorStakeholderId: "vendor-stakeholder-1",
        recommendationHash: hashB
      },
      tecChair
    );

    expect(recommendation).toMatchObject({
      tenderId: "tender-1",
      recommendationHash: hashB,
      status: "APPROVAL_PENDING",
      txHash: "0xmockawardrecommended0000000000000000000000000000000000000000"
    });
    expect(db.tenders[0].currentState).toBe("AWARD_RECOMMENDED");
    expect(db.publicAuditProofs).toContainEqual(
      expect.objectContaining({
        proofType: "AWARD_RECOMMENDATION",
        proofHash: hashB
      })
    );
    expect(db.auditLogs.at(-1)).toMatchObject({
      action: "AWARD_RECOMMENDATION_SUBMITTED",
      status: "MOCK_CHAIN_CONFIRMED"
    });
    expect(JSON.stringify(db.auditLogs)).not.toContain("TEC-CHAIR-001");
  });

  it("does not approve the award until the approval threshold is met", async () => {
    seedBaseTender("AWARD_RECOMMENDED");
    db.recommendations.push({
      id: "award-recommendation-1",
      tenderId: "tender-1",
      recommendationHash: hashB,
      status: "APPROVAL_PENDING"
    });

    const firstApproval = await approveAward(
      {
        tenderId: "tender-1",
        awardRecommendationId: "award-recommendation-1",
        signatureHash: hashA
      },
      approvingOfficerOne
    );

    expect(firstApproval).toMatchObject({
      approvedCount: 1,
      threshold: 2,
      thresholdMet: false,
      tenderState: "AWARD_RECOMMENDED"
    });
    expect(db.tenders[0].currentState).toBe("AWARD_RECOMMENDED");

    const secondApproval = await approveAward(
      {
        tenderId: "tender-1",
        awardRecommendationId: "award-recommendation-1",
        signatureHash: hashC
      },
      approvingOfficerTwo
    );

    expect(secondApproval).toMatchObject({
      approvedCount: 2,
      threshold: 2,
      thresholdMet: true,
      tenderState: "AWARD_APPROVED"
    });
    expect(db.tenders[0].currentState).toBe("AWARD_APPROVED");
    expect(db.recommendations[0].status).toBe("APPROVED");
    expect(db.auditLogs.at(-1)).toMatchObject({
      action: "AWARD_APPROVAL_THRESHOLD_MET",
      transitionAllowed: true
    });
  });

  it("commits LOI, LOA, and contract hash proofs without storing document content", async () => {
    seedBaseTender("AWARD_APPROVED");

    const result = await commitContractProofs(
      {
        tenderId: "tender-1",
        letterOfIntentHash: hashA,
        letterOfAcceptanceHash: hashB,
        contractHash: hashC
      },
      procurementOfficer
    );

    expect(result.proofs.map((proof) => proof.documentType)).toEqual(["LETTER_OF_INTENT", "LETTER_OF_ACCEPTANCE", "CONTRACT"]);
    expect(db.publicAuditProofs).toHaveLength(3);
    expect(db.tenders[0].currentState).toBe("CONTRACT_SIGNED");
    expect(relayerMocks.recordContractHashCommitted).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(db.auditLogs)).not.toContain("contract.pdf");
    expect(JSON.stringify(db.auditLogs)).not.toContain("raw document");
  });

  it("does not call award relayer methods when gateway policy rejects the action", async () => {
    seedBaseTender("AWARD_RECOMMENDED");
    db.recommendations.push({
      id: "award-recommendation-1",
      tenderId: "tender-1",
      recommendationHash: hashB,
      status: "APPROVAL_PENDING"
    });
    gatewayMocks.assertSecureGatewayAction.mockRejectedValueOnce(
      Object.assign(new Error("Tender assignment required."), {
        statusCode: 403,
        code: "AUTHORIZATION_ERROR"
      })
    );

    await expect(
      approveAward(
        {
          tenderId: "tender-1",
          awardRecommendationId: "award-recommendation-1",
          signatureHash: hashA
        },
        approvingOfficerOne
      )
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "AUTHORIZATION_ERROR"
    });

    expect(relayerMocks.recordAwardApproved).not.toHaveBeenCalled();
    expect(db.blockchainTransactions).toHaveLength(0);
    expect(db.publicAuditProofs).toHaveLength(0);
    expect(db.approvals).toHaveLength(0);
  });
});
