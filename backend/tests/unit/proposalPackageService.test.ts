import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProposalEnvelopeType } from "@prisma/client";
import type { AuthenticatedUser } from "../../src/types/domain.js";
import { permissions } from "../../src/types/domain.js";

const db = vi.hoisted(() => ({
  proposalSeq: 0,
  envelopeSeq: 0,
  fileSeq: 0,
  blockchainSeq: 0,
  auditSeq: 0,
  proofSeq: 0,
  tenders: [] as Array<Record<string, unknown>>,
  stakeholders: [] as Array<Record<string, unknown>>,
  assignments: [] as Array<Record<string, unknown>>,
  proposalPackages: [] as Array<Record<string, unknown>>,
  envelopes: [] as Array<Record<string, unknown>>,
  fileReferences: [] as Array<Record<string, unknown>>,
  blockchainTransactions: [] as Array<Record<string, unknown>>,
  auditLogs: [] as Array<Record<string, unknown>>,
  publicAuditProofs: [] as Array<Record<string, unknown>>,
  reset() {
    this.proposalSeq = 0;
    this.envelopeSeq = 0;
    this.fileSeq = 0;
    this.blockchainSeq = 0;
    this.auditSeq = 0;
    this.proofSeq = 0;
    this.tenders.length = 0;
    this.stakeholders.length = 0;
    this.assignments.length = 0;
    this.proposalPackages.length = 0;
    this.envelopes.length = 0;
    this.fileReferences.length = 0;
    this.blockchainTransactions.length = 0;
    this.auditLogs.length = 0;
    this.publicAuditProofs.length = 0;
  }
}));

function stakeholderForAssignment(assignment: Record<string, unknown>) {
  return db.stakeholders.find((stakeholder) => stakeholder.id === assignment.stakeholderId) ?? null;
}

function includeStakeholder(assignment: Record<string, unknown>) {
  return {
    ...assignment,
    stakeholder: stakeholderForAssignment(assignment)
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
          const stakeholder = stakeholderForAssignment(candidate);
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
    proposalPackage: {
      upsert: vi.fn(async ({ where, update, create }) => {
        const compound = where.tenderId_vendorEmployeeHash;
        let proposalPackage = db.proposalPackages.find(
          (candidate) =>
            candidate.tenderId === compound.tenderId && candidate.vendorEmployeeHash === compound.vendorEmployeeHash
        );

        if (proposalPackage) {
          Object.assign(proposalPackage, update);
        } else {
          const createdProposalPackage = {
            id: `proposal-${++db.proposalSeq}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...create
          };
          db.proposalPackages.push(createdProposalPackage);
          proposalPackage = createdProposalPackage;
        }

        return proposalPackage;
      }),
      findUnique: vi.fn(async ({ where }) => {
        const proposalPackage = db.proposalPackages.find((candidate) => candidate.id === where.id);

        if (!proposalPackage) {
          return null;
        }

        return {
          ...proposalPackage,
          tender: db.tenders.find((tender) => tender.id === proposalPackage.tenderId),
          vendorStakeholder: db.stakeholders.find((stakeholder) => stakeholder.id === proposalPackage.vendorStakeholderId),
          envelopes: db.envelopes
            .filter((envelope) => envelope.proposalPackageId === proposalPackage.id)
            .map((envelope) => ({
              ...envelope,
              fileReferences: db.fileReferences.filter((file) => file.proposalEnvelopeId === envelope.id)
            }))
        };
      }),
      findMany: vi.fn(async ({ where, include }) =>
        db.proposalPackages
          .filter(
            (proposalPackage) =>
              proposalPackage.tenderId === where.tenderId &&
              (!where.vendorEmployeeHash || proposalPackage.vendorEmployeeHash === where.vendorEmployeeHash)
          )
          .map((proposalPackage) => ({
            ...proposalPackage,
            envelopes: db.envelopes.filter(
              (envelope) =>
                envelope.proposalPackageId === proposalPackage.id &&
                (!include?.envelopes?.where?.envelopeType?.in ||
                  include.envelopes.where.envelopeType.in.includes(envelope.envelopeType))
            ),
            vendorStakeholder: db.stakeholders.find((stakeholder) => stakeholder.id === proposalPackage.vendorStakeholderId)
          }))
      )
    },
    proposalEnvelope: {
      upsert: vi.fn(async ({ where, update, create }) => {
        const compound = where.proposalPackageId_envelopeType;
        let envelope = db.envelopes.find(
          (candidate) =>
            candidate.proposalPackageId === compound.proposalPackageId && candidate.envelopeType === compound.envelopeType
        );

        if (envelope) {
          Object.assign(envelope, update);
        } else {
          const createdEnvelope = {
            id: `envelope-${++db.envelopeSeq}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...create
          };
          db.envelopes.push(createdEnvelope);
          envelope = createdEnvelope;
        }

        return envelope;
      })
    },
    encryptedFileReference: {
      upsert: vi.fn(async ({ where, update, create }) => {
        let fileReference = db.fileReferences.find((candidate) => candidate.storageKey === where.storageKey);

        if (fileReference) {
          Object.assign(fileReference, update);
        } else {
          const createdFileReference = {
            id: `file-${++db.fileSeq}`,
            createdAt: new Date(),
            ...create
          };
          db.fileReferences.push(createdFileReference);
          fileReference = createdFileReference;
        }

        return fileReference;
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

const { getProposalPackage, listProposalPackages, submitProposalPackage, uploadEncryptedProposalEnvelope } = await import(
  "../../src/services/proposalPackageService.js"
);

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
  permissions: [permissions.SUBMIT_PROPOSAL_PACKAGE, permissions.COMMIT_PROPOSAL_ENVELOPE]
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
  permissions: [permissions.CREATE_TENDER]
};

const tecMember: AuthenticatedUser = {
  userId: "tec-user",
  profileId: "profile-tec",
  holderDID: "did:key:tec",
  employmentId: "TEC-001",
  employeeHash: "0xtec",
  employer: "Tender Evaluation Committee",
  position: "TEC Member",
  employmentType: "Committee",
  role: "TEC_MEMBER",
  permissions: [permissions.VIEW_ASSIGNED_TENDERS, permissions.REQUEST_KEY_RELEASE]
};

const bankOfficer: AuthenticatedUser = {
  userId: "bank-user",
  profileId: "profile-bank",
  holderDID: "did:key:bank",
  employmentId: "BANK-001",
  employeeHash: "0xbank",
  employer: "Demo Bank Ltd",
  position: "Financial Institution Officer",
  employmentType: "Regular",
  role: "FINANCIAL_INSTITUTION_OFFICER",
  permissions: [permissions.VIEW_ASSIGNED_TENDERS, permissions.REQUEST_KEY_RELEASE]
};

const hashes = {
  packageHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  encrypted: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  manifest: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
};

const envelopeTypes: ProposalEnvelopeType[] = [
  "ELIGIBILITY",
  "TECHNICAL",
  "FINANCIAL",
  "SUPPORTING_DOCUMENTS",
  "TENDER_SECURITY"
];

function envelopes(extra: Record<string, unknown> = {}) {
  return envelopeTypes.map((envelopeType, index) => ({
    envelopeType,
    encryptedFileHash: `0x${String(index + 1).repeat(64)}`,
    envelopeManifestHash: `0x${String(index + 2).repeat(64)}`,
    storageReference: `mock-storage/tender-1/${envelopeType.toLowerCase()}.enc`,
    byteSize: 1024 + index,
    originalFilename: `${envelopeType.toLowerCase()}.pdf.enc`,
    ...extra
  }));
}

function seedTender(currentState = "PUBLISHED") {
  db.tenders.push({
    id: "tender-1",
    tenderCode: "TDR-PROPOSAL-001",
    currentState,
    createdByEmployeeHash: "0xproc",
    createdByRole: "PROCUREMENT_OFFICER"
  });
  db.stakeholders.push({
    id: "stakeholder-vendor",
    userId: "vendor-user",
    employeeHash: "0xvendor",
    stakeholderType: "VENDOR"
  });
  db.assignments.push({
    id: "assignment-vendor",
    tenderId: "tender-1",
    stakeholderId: "stakeholder-vendor",
    role: "VENDOR",
    status: "ACTIVE",
    assignedAt: new Date()
  });
}

function seedAssignment(user: AuthenticatedUser, stakeholderType = "EVALUATION_COMMITTEE") {
  const stakeholderId = `stakeholder-${user.role.toLowerCase()}`;

  db.stakeholders.push({
    id: stakeholderId,
    userId: user.userId,
    employeeHash: user.employeeHash,
    stakeholderType
  });
  db.assignments.push({
    id: `assignment-${user.role.toLowerCase()}`,
    tenderId: "tender-1",
    stakeholderId,
    role: user.role,
    status: "ACTIVE",
    assignedAt: new Date()
  });
}

async function seedSubmittedPackage() {
  await submitProposalPackage(
    {
      tenderId: "tender-1",
      packageHash: hashes.packageHash,
      envelopes: envelopes()
    },
    vendor
  );
}

describe("proposalPackageService", () => {
  beforeEach(() => {
    db.reset();
    seedTender();
  });

  it("submits a complete five-envelope proposal package with hash-only audit evidence", async () => {
    const result = await submitProposalPackage(
      {
        tenderId: "tender-1",
        packageHash: hashes.packageHash,
        envelopes: envelopes()
      },
      vendor
    );

    expect(result.proposalPackage).toMatchObject({
      tenderId: "tender-1",
      vendorEmployeeHash: "0xvendor",
      packageHash: hashes.packageHash,
      status: "SUBMITTED",
      blockchainStatus: "MOCK_CONFIRMED"
    });
    expect(result.envelopes).toHaveLength(5);
    expect(db.fileReferences).toHaveLength(5);
    expect(db.blockchainTransactions.map((tx) => tx.action)).toEqual([
      "PROPOSAL_PACKAGE_SUBMITTED",
      "PROPOSAL_ENVELOPE_COMMITTED",
      "PROPOSAL_ENVELOPE_COMMITTED",
      "PROPOSAL_ENVELOPE_COMMITTED",
      "PROPOSAL_ENVELOPE_COMMITTED",
      "PROPOSAL_ENVELOPE_COMMITTED"
    ]);
    expect(db.auditLogs.map((audit) => audit.action)).toEqual([
      "PROPOSAL_PACKAGE_SUBMITTED",
      "PROPOSAL_ENVELOPE_COMMITTED",
      "PROPOSAL_ENVELOPE_COMMITTED",
      "PROPOSAL_ENVELOPE_COMMITTED",
      "PROPOSAL_ENVELOPE_COMMITTED",
      "PROPOSAL_ENVELOPE_COMMITTED"
    ]);
    expect(JSON.stringify(db.auditLogs)).not.toContain("VEND-001");
    expect(JSON.stringify(db.auditLogs)).not.toContain("plaintext");
  });

  it("blocks proposal submission after tender close before writing package data", async () => {
    db.reset();
    seedTender("CLOSED");

    await expect(
      submitProposalPackage(
        {
          tenderId: "tender-1",
          packageHash: hashes.packageHash,
          envelopes: envelopes()
        },
        vendor
      )
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "INVALID_TRANSITION"
    });

    expect(db.proposalPackages).toHaveLength(0);
    expect(db.envelopes).toHaveLength(0);
    expect(db.blockchainTransactions).toHaveLength(0);
    expect(db.publicAuditProofs).toHaveLength(0);
    expect(db.auditLogs.at(-1)).toMatchObject({
      action: "UNAUTHORIZED_ACTION_ATTEMPTED",
      status: "BLOCKED",
      rejectionReason: "TENDER_STATE_NOT_ALLOWED"
    });
  });

  it("blocks wrong-role proposal package submission", async () => {
    await expect(
      submitProposalPackage(
        {
          tenderId: "tender-1",
          packageHash: hashes.packageHash,
          envelopes: envelopes()
        },
        procurementOfficer
      )
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "AUTHORIZATION_ERROR"
    });

    expect(db.proposalPackages).toHaveLength(0);
    expect(db.blockchainTransactions).toHaveLength(0);
    expect(db.auditLogs.at(-1)).toMatchObject({
      action: "UNAUTHORIZED_ACTION_ATTEMPTED",
      actorRole: "PROCUREMENT_OFFICER"
    });
  });

  it("rejects plaintext-like fields before storage", async () => {
    await expect(
      submitProposalPackage(
        {
          tenderId: "tender-1",
          packageHash: hashes.packageHash,
          envelopes: envelopes({ metadata: { plaintext: "bid amount 123" } })
        },
        vendor
      )
    ).rejects.toMatchObject({
      statusCode: 422,
      code: "VALIDATION_ERROR"
    });

    expect(db.proposalPackages).toHaveLength(0);
    expect(db.envelopes).toHaveLength(0);
    expect(db.fileReferences).toHaveLength(0);
    expect(db.blockchainTransactions).toHaveLength(0);
    expect(db.publicAuditProofs).toHaveLength(0);
  });

  it("commits an uploaded encrypted envelope using the server-computed encrypted file hash", async () => {
    db.proposalPackages.push({
      id: "proposal-1",
      tenderId: "tender-1",
      vendorEmployeeHash: "0xvendor",
      packageHash: hashes.packageHash,
      status: "SUBMITTED"
    });

    const envelope = await uploadEncryptedProposalEnvelope(
      {
        proposalPackageId: "proposal-1",
        envelopeType: "TECHNICAL",
        envelopeManifestHash: hashes.manifest,
        encryptedFile: {
          encryptedFileHash: hashes.encrypted,
          sanitizedFilename: "technical.pdf.enc",
          byteLength: 2048,
          mimeType: "application/octet-stream"
        },
        iv: "mock-iv",
        authTag: "mock-auth-tag"
      },
      vendor
    );

    expect(envelope).toMatchObject({
      proposalPackageId: "proposal-1",
      envelopeType: "TECHNICAL",
      encryptedFileHash: hashes.encrypted,
      envelopeManifestHash: hashes.manifest
    });
    expect(db.fileReferences.at(-1)).toMatchObject({
      proposalEnvelopeId: envelope.id,
      encryptedFileHash: hashes.encrypted,
      originalFilename: "technical.pdf.enc",
      byteSize: 2048
    });
    expect(JSON.stringify(db.fileReferences.at(-1))).not.toContain("financial proposal amount");
  });

  it("shows only technical-stage envelopes to assigned TEC members", async () => {
    await seedSubmittedPackage();
    Object.assign(db.tenders[0], { currentState: "TECHNICAL_EVALUATION" });
    seedAssignment(tecMember);

    const packages = await listProposalPackages("tender-1", tecMember);

    expect(packages).toHaveLength(1);
    expect(packages[0].envelopes.map((envelope: Record<string, unknown>) => envelope.envelopeType).sort()).toEqual([
      "ELIGIBILITY",
      "SUPPORTING_DOCUMENTS",
      "TECHNICAL"
    ]);
  });

  it("does not expose financial envelopes before financial evaluation", async () => {
    await seedSubmittedPackage();
    Object.assign(db.tenders[0], { currentState: "TECHNICAL_EVALUATION" });
    seedAssignment(bankOfficer, "FINANCIAL_INSTITUTION");

    const packages = await listProposalPackages("tender-1", bankOfficer);

    expect(packages).toEqual([]);
    await expect(getProposalPackage("proposal-1", bankOfficer)).rejects.toMatchObject({
      statusCode: 403,
      code: "AUTHORIZATION_ERROR"
    });
  });
});
