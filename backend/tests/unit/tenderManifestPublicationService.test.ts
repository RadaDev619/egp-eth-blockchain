import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../../src/types/domain.js";
import { permissions } from "../../src/types/domain.js";

const db = vi.hoisted(() => ({
  tenderSeq: 0,
  manifestSeq: 0,
  versionSeq: 0,
  stakeholderSeq: 0,
  assignmentSeq: 0,
  approvalSeq: 0,
  transitionSeq: 0,
  blockchainSeq: 0,
  auditSeq: 0,
  proofSeq: 0,
  tenders: [] as Array<Record<string, unknown>>,
  manifests: [] as Array<Record<string, unknown>>,
  versions: [] as Array<Record<string, unknown>>,
  stakeholders: [] as Array<Record<string, unknown>>,
  assignments: [] as Array<Record<string, unknown>>,
  approvals: [] as Array<Record<string, unknown>>,
  transitions: [] as Array<Record<string, unknown>>,
  blockchainTransactions: [] as Array<Record<string, unknown>>,
  auditLogs: [] as Array<Record<string, unknown>>,
  publicAuditProofs: [] as Array<Record<string, unknown>>,
  reset() {
    this.tenderSeq = 0;
    this.manifestSeq = 0;
    this.versionSeq = 0;
    this.stakeholderSeq = 0;
    this.assignmentSeq = 0;
    this.approvalSeq = 0;
    this.transitionSeq = 0;
    this.blockchainSeq = 0;
    this.auditSeq = 0;
    this.proofSeq = 0;
    this.tenders.length = 0;
    this.manifests.length = 0;
    this.versions.length = 0;
    this.stakeholders.length = 0;
    this.assignments.length = 0;
    this.approvals.length = 0;
    this.transitions.length = 0;
    this.blockchainTransactions.length = 0;
    this.auditLogs.length = 0;
    this.publicAuditProofs.length = 0;
  }
}));

function includeTenderRelations(tender: Record<string, unknown>) {
  const manifests = db.manifests
    .filter((manifest) => manifest.tenderId === tender.id)
    .sort((a, b) => Number(b.versionNumber) - Number(a.versionNumber))
    .map((manifest) => ({
      ...manifest,
      publicationApprovals: db.approvals
        .filter((approval) => approval.manifestId === manifest.id)
        .sort((a, b) => Number(a.createdAt) - Number(b.createdAt))
    }));

  return {
    ...tender,
    manifests,
    publicAuditProofs: db.publicAuditProofs.filter((proof) => proof.tenderId === tender.id)
  };
}

function includeStakeholder(assignment: Record<string, unknown>) {
  return {
    ...assignment,
    stakeholder: db.stakeholders.find((stakeholder) => stakeholder.id === assignment.stakeholderId) ?? null
  };
}

vi.mock("../../src/utils/prisma.js", () => {
  const prisma = {
    tender: {
      create: vi.fn(async ({ data }) => {
        const tender = {
          id: `tender-${++db.tenderSeq}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data
        };
        db.tenders.push(tender);
        return tender;
      }),
      findUnique: vi.fn(async ({ where }) => {
        const tender = db.tenders.find((candidate) => candidate.id === where.id);
        return tender ? includeTenderRelations(tender) : null;
      }),
      update: vi.fn(async ({ where, data }) => {
        const tender = db.tenders.find((candidate) => candidate.id === where.id);

        if (!tender) {
          throw new Error("Tender not found.");
        }

        Object.assign(tender, data, { updatedAt: new Date() });
        return includeTenderRelations(tender);
      })
    },
    tenderManifest: {
      create: vi.fn(async ({ data }) => {
        const manifest = {
          id: `manifest-${++db.manifestSeq}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data
        };
        db.manifests.push(manifest);
        return manifest;
      }),
      findFirst: vi.fn(async ({ where }) => {
        const candidates = db.manifests.filter((manifest) => {
          const idMatches = !where.id || manifest.id === where.id;
          const tenderMatches = !where.tenderId || manifest.tenderId === where.tenderId;
          const statusMatches =
            !where.status ||
            (typeof where.status === "string" ? manifest.status === where.status : where.status.in.includes(manifest.status));

          return idMatches && tenderMatches && statusMatches;
        });

        return candidates.sort((a, b) => Number(b.versionNumber) - Number(a.versionNumber))[0] ?? null;
      }),
      update: vi.fn(async ({ where, data }) => {
        const manifest = db.manifests.find((candidate) => candidate.id === where.id);

        if (!manifest) {
          throw new Error("Manifest not found.");
        }

        Object.assign(manifest, data, { updatedAt: new Date() });
        return manifest;
      })
    },
    tenderVersion: {
      create: vi.fn(async ({ data }) => {
        const version = { id: `version-${++db.versionSeq}`, createdAt: new Date(), ...data };
        db.versions.push(version);
        return version;
      })
    },
    stakeholder: {
      upsert: vi.fn(async ({ where, update, create }) => {
        const compound = where.userId_stakeholderType;
        let stakeholder = db.stakeholders.find(
          (candidate) => candidate.userId === compound.userId && candidate.stakeholderType === compound.stakeholderType
        );

        if (stakeholder) {
          Object.assign(stakeholder, update);
        } else {
          const createdStakeholder = {
            id: `stakeholder-${++db.stakeholderSeq}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...create
          };
          db.stakeholders.push(createdStakeholder);
          stakeholder = createdStakeholder;
        }

        return stakeholder;
      })
    },
    tenderRoleAssignment: {
      upsert: vi.fn(async ({ where, update, create }) => {
        const compound = where.tenderId_stakeholderId_role;
        let assignment = db.assignments.find(
          (candidate) =>
            candidate.tenderId === compound.tenderId &&
            candidate.stakeholderId === compound.stakeholderId &&
            candidate.role === compound.role
        );

        if (assignment) {
          Object.assign(assignment, update);
        } else {
          const createdAssignment = {
            id: `assignment-${++db.assignmentSeq}`,
            assignedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            ...create
          };
          db.assignments.push(createdAssignment);
          assignment = createdAssignment;
        }

        if (!assignment) {
          throw new Error("Assignment upsert failed.");
        }

        return includeStakeholder(assignment);
      }),
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
    tenderPublicationApproval: {
      upsert: vi.fn(async ({ where, update, create }) => {
        const compound = where.manifestId_approverEmployeeHash;
        let approval = db.approvals.find(
          (candidate) =>
            candidate.manifestId === compound.manifestId && candidate.approverEmployeeHash === compound.approverEmployeeHash
        );

        if (approval) {
          Object.assign(approval, update);
        } else {
          const createdApproval = {
            id: `approval-${++db.approvalSeq}`,
            createdAt: new Date(),
            ...create
          };
          db.approvals.push(createdApproval);
          approval = createdApproval;
        }

        return approval;
      }),
      count: vi.fn(async ({ where }) =>
        db.approvals.filter((approval) => approval.manifestId === where.manifestId && approval.decision === where.decision).length
      )
    },
    procurementTransition: {
      create: vi.fn(async ({ data }) => {
        const transition = { id: `transition-${++db.transitionSeq}`, createdAt: new Date(), ...data };
        db.transitions.push(transition);
        return transition;
      })
    },
    blockchainTransaction: {
      create: vi.fn(async ({ data }) => {
        const tx = { id: `blockchain-${++db.blockchainSeq}`, createdAt: new Date(), ...data };
        db.blockchainTransactions.push(tx);
        return tx;
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
          const createdProof = {
            id: `proof-${++db.proofSeq}`,
            createdAt: new Date(),
            ...create
          };
          db.publicAuditProofs.push(createdProof);
          proof = createdProof;
        }

        return proof;
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
  approveTenderPublication,
  createTenderManifest,
  requestTenderPublication
} = await import("../../src/services/tenderManifestPublicationService.js");

const hashA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const hashB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

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
  permissions: [permissions.CREATE_TENDER_MANIFEST, permissions.REQUEST_PUBLICATION_APPROVAL]
};

const approvingOfficer: AuthenticatedUser = {
  userId: "app-user",
  profileId: "profile-app",
  holderDID: "did:key:app",
  employmentId: "APP-001",
  employeeHash: "0xapp",
  employer: "Ministry of Finance",
  position: "Approving Officer",
  employmentType: "Regular",
  role: "APPROVING_OFFICER",
  permissions: [permissions.APPROVE_TENDER_PUBLICATION]
};

const vendor: AuthenticatedUser = {
  userId: "vendor-user",
  profileId: "profile-vendor",
  holderDID: "did:key:vendor",
  employmentId: "VEND-001",
  employeeHash: "0xvendor",
  employer: "Demo Vendor Pvt Ltd",
  position: "Vendor Representative",
  employmentType: "Contract",
  role: "VENDOR",
  permissions: [permissions.SUBMIT_PROPOSAL_PACKAGE]
};

function addApprovingOfficerAssignment(tenderId: string) {
  const stakeholder = {
    id: "stakeholder-app",
    userId: approvingOfficer.userId,
    employeeHash: approvingOfficer.employeeHash,
    stakeholderType: "PROCURING_AGENCY"
  };
  db.stakeholders.push(stakeholder);
  db.assignments.push({
    id: "assignment-app",
    tenderId,
    stakeholderId: stakeholder.id,
    role: "APPROVING_OFFICER",
    status: "ACTIVE",
    assignedAt: new Date()
  });
}

async function createAndRequestPublication() {
  const created = await createTenderManifest(
    {
      tenderCode: "TDR-PUB-001",
      agency: "Ministry of Finance",
      title: "Secure Gateway Tender",
      description: "Tender manifest publication flow",
      manifestHash: hashA,
      publicationThreshold: 2
    },
    procurementOfficer
  );
  await requestTenderPublication({ tenderId: String(created.tender.id) }, procurementOfficer);

  return created.tender.id as string;
}

describe("tenderManifestPublicationService", () => {
  beforeEach(() => {
    db.reset();
  });

  it("creates a DRAFT tender manifest with backend proof and creator assignment", async () => {
    const status = await createTenderManifest(
      {
        tenderCode: "TDR-MANIFEST-001",
        agency: "Ministry of Finance",
        title: "Secure Gateway Tender",
        description: "Tender manifest commitment",
        manifestHash: hashA,
        publicationThreshold: 2
      },
      procurementOfficer
    );

    expect(status.currentState).toBe("DRAFT");
    expect(status.manifest).toMatchObject({
      manifestHash: hashA,
      publicationThreshold: 2,
      blockchainStatus: "MOCK_CONFIRMED"
    });
    expect(db.assignments).toContainEqual(
      expect.objectContaining({
        tenderId: status.tender.id,
        role: "PROCUREMENT_OFFICER",
        status: "ACTIVE"
      })
    );
    expect(db.auditLogs.at(-1)).toMatchObject({
      action: "TENDER_MANIFEST_COMMITTED",
      status: "MOCK_CHAIN_CONFIRMED",
      actorRole: "PROCUREMENT_OFFICER",
      actorEmployeeHash: "0xproc"
    });
    expect(JSON.stringify(db.auditLogs.at(-1))).not.toContain("PROC-001");
  });

  it("moves DRAFT to PUBLICATION_PENDING when publication is requested", async () => {
    const status = await createTenderManifest(
      {
        tenderCode: "TDR-REQUEST-001",
        agency: "Ministry of Finance",
        title: "Secure Gateway Tender",
        description: "Tender manifest publication request",
        manifestHash: hashA,
        publicationThreshold: 2
      },
      procurementOfficer
    );

    const requested = await requestTenderPublication({ tenderId: String(status.tender.id) }, procurementOfficer);

    expect(requested.currentState).toBe("PUBLICATION_PENDING");
    expect(requested.approvalCount).toBe(1);
    expect(db.transitions.at(-1)).toMatchObject({
      action: "REQUEST_PUBLICATION_APPROVAL",
      fromState: "DRAFT",
      toState: "PUBLICATION_PENDING",
      allowed: true
    });
    expect(db.auditLogs.at(-1)).toMatchObject({
      action: "TENDER_PUBLICATION_REQUESTED",
      status: "MOCK_CHAIN_CONFIRMED"
    });
  });

  it("publishes only after threshold approval is met", async () => {
    const tenderId = await createAndRequestPublication();
    addApprovingOfficerAssignment(tenderId);

    const published = await approveTenderPublication(
      {
        tenderId,
        signatureHash: hashB,
        comments: "Approved for publication"
      },
      approvingOfficer
    );

    expect(published.currentState).toBe("PUBLISHED");
    expect(published.approvalCount).toBe(2);
    expect(published.publicationReady).toBe(true);
    expect(db.publicAuditProofs).toContainEqual(
      expect.objectContaining({
        tenderId,
        proofType: "TENDER_MANIFEST",
        proofHash: hashA,
        blockchainStatus: "MOCK_CONFIRMED"
      })
    );
    expect(db.auditLogs.at(-1)).toMatchObject({
      action: "TENDER_PUBLISHED",
      status: "MOCK_CHAIN_CONFIRMED",
      actorRole: "APPROVING_OFFICER"
    });
    expect(db.blockchainTransactions.map((tx) => tx.action)).toContain("TENDER_PUBLISHED");
  });

  it("blocks vendors from approving publication and records a blocked audit event", async () => {
    const tenderId = await createAndRequestPublication();

    await expect(
      approveTenderPublication(
        {
          tenderId,
          signatureHash: hashB
        },
        vendor
      )
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "AUTHORIZATION_ERROR"
    });

    expect(db.tenders[0].currentState).toBe("PUBLICATION_PENDING");
    expect(db.auditLogs.at(-1)).toMatchObject({
      action: "UNAUTHORIZED_ACTION_ATTEMPTED",
      status: "BLOCKED",
      actorRole: "VENDOR"
    });
  });
});
