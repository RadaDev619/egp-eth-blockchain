import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../../src/types/domain.js";
import { permissions } from "../../src/types/domain.js";

const db = vi.hoisted(() => ({
  requestSeq: 0,
  auditSeq: 0,
  tenders: [] as Array<Record<string, unknown>>,
  stakeholders: [] as Array<Record<string, unknown>>,
  assignments: [] as Array<Record<string, unknown>>,
  proposalPackages: [] as Array<Record<string, unknown>>,
  envelopes: [] as Array<Record<string, unknown>>,
  policies: [] as Array<Record<string, unknown>>,
  requests: [] as Array<Record<string, unknown>>,
  auditLogs: [] as Array<Record<string, unknown>>,
  reset() {
    this.requestSeq = 0;
    this.auditSeq = 0;
    this.tenders.length = 0;
    this.stakeholders.length = 0;
    this.assignments.length = 0;
    this.proposalPackages.length = 0;
    this.envelopes.length = 0;
    this.policies.length = 0;
    this.requests.length = 0;
    this.auditLogs.length = 0;
  }
}));

function includeStakeholder(assignment: Record<string, unknown>) {
  return {
    ...assignment,
    stakeholder: db.stakeholders.find((stakeholder) => stakeholder.id === assignment.stakeholderId) ?? null
  };
}

function includeEnvelope(envelope: Record<string, unknown>) {
  const proposalPackage = db.proposalPackages.find((candidate) => candidate.id === envelope.proposalPackageId);
  const tender = db.tenders.find((candidate) => candidate.id === proposalPackage?.tenderId);

  return {
    ...envelope,
    proposalPackage: {
      ...proposalPackage,
      tender
    }
  };
}

function includeRequest(request: Record<string, unknown>) {
  const policy = db.policies.find((candidate) => candidate.id === request.policyId) ?? null;
  const envelope = db.envelopes.find((candidate) => candidate.id === request.proposalEnvelopeId);

  return {
    ...request,
    policy,
    proposalEnvelope: envelope ? includeEnvelope(envelope) : null
  };
}

vi.mock("../../src/utils/prisma.js", () => {
  const prisma = {
    tender: {
      findUnique: vi.fn(async ({ where }) => db.tenders.find((tender) => tender.id === where.id) ?? null)
    },
    tenderRoleAssignment: {
      findFirst: vi.fn(async ({ where }) => {
        const assignment = db.assignments.find((candidate) => {
          const stakeholder = db.stakeholders.find((item) => item.id === candidate.stakeholderId);
          const stakeholderMatches =
            !where.stakeholder ||
            where.stakeholder.OR.some(
              (condition: Record<string, string>) =>
                ("userId" in condition && stakeholder?.userId === condition.userId) ||
                ("employeeHash" in condition && stakeholder?.employeeHash === condition.employeeHash)
            );

          return (
            candidate.tenderId === where.tenderId &&
            (!where.role || candidate.role === where.role) &&
            (!where.status || candidate.status === where.status) &&
            stakeholderMatches
          );
        });

        if (!assignment) {
          return null;
        }

        if (where.select) {
          return { id: assignment.id };
        }

        return includeStakeholder(assignment);
      })
    },
    proposalEnvelope: {
      findUnique: vi.fn(async ({ where }) => {
        const envelope = db.envelopes.find((candidate) => candidate.id === where.id);

        return envelope ? includeEnvelope(envelope) : null;
      })
    },
    keyReleasePolicy: {
      findFirst: vi.fn(async ({ where }) =>
        db.policies.find((policy) => {
          const proposalEnvelopeMatches =
            !where.OR ||
            where.OR.some((condition: Record<string, string | null>) => condition.proposalEnvelopeId === policy.proposalEnvelopeId);

          return (
            policy.tenderId === where.tenderId &&
            policy.envelopeType === where.envelopeType &&
            policy.allowedRole === where.allowedRole &&
            policy.requiredTenderState === where.requiredTenderState &&
            policy.isActive === where.isActive &&
            proposalEnvelopeMatches
          );
        }) ?? null
      )
    },
    keyReleaseRequest: {
      create: vi.fn(async ({ data }) => {
        const request = {
          id: `key-request-${++db.requestSeq}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data
        };
        db.requests.push(request);
        return request;
      }),
      findUnique: vi.fn(async ({ where }) => {
        const request = db.requests.find((candidate) => candidate.id === where.id);

        return request ? includeRequest(request) : null;
      }),
      update: vi.fn(async ({ where, data }) => {
        const request = db.requests.find((candidate) => candidate.id === where.id);

        if (!request) {
          throw new Error("Key release request not found.");
        }

        Object.assign(request, data, { updatedAt: new Date() });
        return request;
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

const { releaseEnvelopeKey, requestEnvelopeKeyRelease } = await import("../../src/services/keyManagementService.js");

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
  permissions: [permissions.REQUEST_KEY_RELEASE, permissions.RELEASE_ENVELOPE_KEY]
};

const validHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function seedTender(currentState: string) {
  db.tenders.push({
    id: "tender-1",
    tenderCode: "TDR-KMS-001",
    currentState,
    createdByEmployeeHash: "0xproc",
    createdByRole: "PROCUREMENT_OFFICER"
  });
  db.stakeholders.push({
    id: "stakeholder-tec-chair",
    userId: tecChair.userId,
    employeeHash: tecChair.employeeHash,
    stakeholderType: "EVALUATION_COMMITTEE"
  });
  db.assignments.push({
    id: "assignment-tec-chair",
    tenderId: "tender-1",
    stakeholderId: "stakeholder-tec-chair",
    role: "TEC_CHAIR",
    status: "ACTIVE",
    assignedAt: new Date()
  });
  db.proposalPackages.push({
    id: "proposal-package-1",
    tenderId: "tender-1",
    vendorEmployeeHash: "0xvendor",
    packageHash: validHash,
    status: "SUBMITTED"
  });
}

function seedEnvelope(envelopeType: string) {
  db.envelopes.push({
    id: `${envelopeType.toLowerCase()}-envelope-1`,
    proposalPackageId: "proposal-package-1",
    envelopeType,
    encryptedFileHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    envelopeManifestHash: validHash,
    encryptionAlgorithm: "AES-GCM"
  });

  return String(db.envelopes.at(-1)?.id);
}

describe("keyManagementService", () => {
  beforeEach(() => {
    db.reset();
  });

  it("creates and releases a key request only after gateway and key policy checks pass", async () => {
    seedTender("TECHNICAL_EVALUATION");
    const envelopeId = seedEnvelope("TECHNICAL");
    db.policies.push({
      id: "policy-technical-chair",
      tenderId: "tender-1",
      proposalEnvelopeId: envelopeId,
      envelopeType: "TECHNICAL",
      allowedRole: "TEC_CHAIR",
      requiredTenderState: "TECHNICAL_EVALUATION",
      requiresIntegrityCheck: true,
      isActive: true,
      createdAt: new Date()
    });

    const requested = await requestEnvelopeKeyRelease({ proposalEnvelopeId: envelopeId }, tecChair);
    expect(requested.request).toMatchObject({
      status: "REQUESTED",
      requesterRole: "TEC_CHAIR",
      requestedTenderState: "TECHNICAL_EVALUATION"
    });

    const released = await releaseEnvelopeKey({ keyReleaseRequestId: requested.request.id }, tecChair);

    expect(released.request).toMatchObject({
      status: "APPROVED",
      keyMaterialReference: expect.stringMatching(/^kms:\/\/mock\/releases\//)
    });
    expect(released.keyMaterialReference).toBe(released.request.keyMaterialReference);
    expect(db.auditLogs.map((audit) => audit.action)).toEqual(["KEY_RELEASE_REQUESTED", "ENVELOPE_KEY_RELEASED"]);
    expect(JSON.stringify(db.auditLogs)).not.toContain("TEC-CHAIR-001");
  });

  it("blocks premature financial envelope access and records a denied request", async () => {
    seedTender("TECHNICAL_EVALUATION");
    const envelopeId = seedEnvelope("FINANCIAL");
    db.policies.push({
      id: "policy-financial-chair",
      tenderId: "tender-1",
      proposalEnvelopeId: envelopeId,
      envelopeType: "FINANCIAL",
      allowedRole: "TEC_CHAIR",
      requiredTenderState: "FINANCIAL_EVALUATION",
      requiresIntegrityCheck: true,
      isActive: true,
      createdAt: new Date()
    });

    await expect(requestEnvelopeKeyRelease({ proposalEnvelopeId: envelopeId }, tecChair)).rejects.toMatchObject({
      statusCode: 409,
      code: "INVALID_TRANSITION"
    });

    expect(db.requests).toContainEqual(
      expect.objectContaining({
        proposalEnvelopeId: envelopeId,
        status: "DENIED",
        rejectionReason: "KEY_RELEASE_POLICY_NOT_SATISFIED"
      })
    );
    expect(db.auditLogs.at(-1)).toMatchObject({
      action: "KEY_RELEASE_BLOCKED",
      status: "BLOCKED",
      actorRole: "TEC_CHAIR",
      resourceType: "KEY_RELEASE_REQUEST",
      rejectionReason: "KEY_RELEASE_POLICY_NOT_SATISFIED"
    });
  });
});
