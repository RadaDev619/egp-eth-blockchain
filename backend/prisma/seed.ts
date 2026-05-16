import { PrismaClient, type Role } from "@prisma/client";
import { createHash } from "node:crypto";
import { demoProfiles } from "../src/config/demoProfiles.js";
import { createEmployeeHash } from "../src/services/employeeHashService.js";
import { rolePermissions } from "../src/types/domain.js";

const prisma = new PrismaClient();
const demoTenderCode = "TDR-DEMO-001";
const demoTenderTxHash = "0xmockseedtendercreated000000000000000000000000000000000000000000000";
const demoDocumentHash = "0x8f3f20f6f5f07a52b93f9165134907de10bf51f4521c6f471df188d7f7bdb001";
const demoTenderId = "tender-demo-001";
const demoManifestId = "manifest-demo-001";
const demoProposalPackageId = "proposal-package-demo-001";
const demoEvaluationReportId = "evaluation-report-demo-001";
const demoAwardRecommendationId = "award-recommendation-demo-001";
const demoProfileIds: Record<string, string> = {
  "PROC-001": "ndi-profile-proc-001",
  "VEND-001": "ndi-profile-vend-001",
  "EVAL-001": "ndi-profile-eval-001",
  "TEC-001": "ndi-profile-tec-001",
  "TEC-CHAIR-001": "ndi-profile-tec-chair-001",
  "FIN-001": "ndi-profile-fin-001",
  "APP-001": "ndi-profile-app-001",
  "APP-002": "ndi-profile-app-002",
  "BANK-001": "ndi-profile-bank-001",
  "AUD-001": "ndi-profile-aud-001"
};

function demoUserId(employmentId: string): string {
  return `${employmentId.toLowerCase()}-user`;
}

function stableHash(input: string): string {
  return `0x${createHash("sha256").update(input).digest("hex")}`;
}

function requireDemoProfile(employmentId: string) {
  const profile = demoProfiles.find((candidate) => candidate.employmentId === employmentId);

  if (!profile) {
    throw new Error(`${employmentId} demo profile is required for demo seeding.`);
  }

  return profile;
}

async function main() {
  for (const [role, permissions] of Object.entries(rolePermissions)) {
    const demoRole = role as Role;

    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: {
          role_permission: {
            role: demoRole,
            permission
          }
        },
        update: {},
        create: {
          role: demoRole,
          permission
        }
      });
    }
  }

  for (const profile of demoProfiles) {
    const employeeHash = createEmployeeHash(profile.employmentId);

    const ndiProfile = await prisma.nDIProfile.upsert({
      where: { employmentId: profile.employmentId },
      update: {
        holderDID: profile.holderDID,
        employeeHash,
        employer: profile.employer,
        position: profile.position,
        employmentType: profile.employmentType
      },
      create: {
        id: demoProfileIds[profile.employmentId],
        holderDID: profile.holderDID,
        employmentId: profile.employmentId,
        employeeHash,
        employer: profile.employer,
        position: profile.position,
        employmentType: profile.employmentType
      }
    });

    await prisma.user.upsert({
      where: { id: demoUserId(profile.employmentId) },
      update: {
        ndiProfileId: ndiProfile.id,
        role: profile.role,
        isActive: true
      },
      create: {
        id: demoUserId(profile.employmentId),
        ndiProfileId: ndiProfile.id,
        role: profile.role
      }
    });
  }

  const stakeholderSeeds = [
    {
      key: "procurementOfficer",
      id: "stakeholder-procurement-officer",
      userId: demoUserId("PROC-001"),
      stakeholderType: "PROCURING_AGENCY",
      displayName: "Demo Procurement Officer",
      organization: "Ministry of Finance",
      employeeHash: createEmployeeHash("PROC-001"),
      businessIdentifierHash: null,
      publicIdentifier: "PA-MOF"
    },
    {
      key: "vendor",
      id: "stakeholder-vendor",
      userId: demoUserId("VEND-001"),
      stakeholderType: "VENDOR",
      displayName: "Demo Vendor Representative",
      organization: "Demo Vendor Pvt Ltd",
      employeeHash: createEmployeeHash("VEND-001"),
      businessIdentifierHash: stableHash("demo-vendor-pvt-ltd"),
      publicIdentifier: "VENDOR-DEMO"
    },
    {
      key: "tecMember",
      id: "stakeholder-tec-member",
      userId: demoUserId("TEC-001"),
      stakeholderType: "EVALUATION_COMMITTEE",
      displayName: "Demo TEC Member",
      organization: "Tender Evaluation Committee",
      employeeHash: createEmployeeHash("TEC-001"),
      businessIdentifierHash: null,
      publicIdentifier: "TEC-MEMBER-DEMO"
    },
    {
      key: "tecChair",
      id: "stakeholder-tec-chair",
      userId: demoUserId("TEC-CHAIR-001"),
      stakeholderType: "EVALUATION_COMMITTEE",
      displayName: "Demo TEC Chairperson",
      organization: "Tender Evaluation Committee",
      employeeHash: createEmployeeHash("TEC-CHAIR-001"),
      businessIdentifierHash: null,
      publicIdentifier: "TEC-CHAIR-DEMO"
    },
    {
      key: "approvingOfficer",
      id: "stakeholder-approving-officer",
      userId: demoUserId("APP-001"),
      stakeholderType: "PROCURING_AGENCY",
      displayName: "Demo Approving Officer",
      organization: "Ministry of Finance",
      employeeHash: createEmployeeHash("APP-001"),
      businessIdentifierHash: null,
      publicIdentifier: "APPROVER-DEMO"
    },
    {
      key: "secondApprovingOfficer",
      id: "stakeholder-second-approving-officer",
      userId: demoUserId("APP-002"),
      stakeholderType: "PROCURING_AGENCY",
      displayName: "Demo Second Approving Officer",
      organization: "Ministry of Finance",
      employeeHash: createEmployeeHash("APP-002"),
      businessIdentifierHash: null,
      publicIdentifier: "APPROVER-DEMO-2"
    },
    {
      key: "financeOfficer",
      id: "stakeholder-finance-officer",
      userId: demoUserId("FIN-001"),
      stakeholderType: "PROCURING_AGENCY",
      displayName: "Demo Finance Officer",
      organization: "Ministry of Finance",
      employeeHash: createEmployeeHash("FIN-001"),
      businessIdentifierHash: null,
      publicIdentifier: "FINANCE-DEMO"
    },
    {
      key: "financialInstitutionOfficer",
      id: "stakeholder-financial-institution-officer",
      userId: demoUserId("BANK-001"),
      stakeholderType: "FINANCIAL_INSTITUTION",
      displayName: "Demo Financial Institution Officer",
      organization: "Demo Bank Ltd",
      employeeHash: createEmployeeHash("BANK-001"),
      businessIdentifierHash: stableHash("demo-bank-ltd"),
      publicIdentifier: "BANK-DEMO"
    },
    {
      key: "auditor",
      id: "stakeholder-auditor",
      userId: demoUserId("AUD-001"),
      stakeholderType: "AUDIT_AUTHORITY",
      displayName: "Demo Auditor",
      organization: "Royal Audit Authority",
      employeeHash: createEmployeeHash("AUD-001"),
      businessIdentifierHash: null,
      publicIdentifier: "AUDIT-DEMO"
    }
  ] as const;

  const stakeholders = new Map<string, string>();

  for (const stakeholderSeed of stakeholderSeeds) {
    const stakeholder = await prisma.stakeholder.upsert({
      where: { id: stakeholderSeed.id },
      update: {
        userId: stakeholderSeed.userId,
        stakeholderType: stakeholderSeed.stakeholderType,
        displayName: stakeholderSeed.displayName,
        organization: stakeholderSeed.organization,
        employeeHash: stakeholderSeed.employeeHash,
        businessIdentifierHash: stakeholderSeed.businessIdentifierHash,
        publicIdentifier: stakeholderSeed.publicIdentifier
      },
      create: {
        id: stakeholderSeed.id,
        userId: stakeholderSeed.userId,
        stakeholderType: stakeholderSeed.stakeholderType,
        displayName: stakeholderSeed.displayName,
        organization: stakeholderSeed.organization,
        employeeHash: stakeholderSeed.employeeHash,
        businessIdentifierHash: stakeholderSeed.businessIdentifierHash,
        publicIdentifier: stakeholderSeed.publicIdentifier
      }
    });

    stakeholders.set(stakeholderSeed.key, stakeholder.id);
  }

  function requireStakeholder(key: string): string {
    const stakeholderId = stakeholders.get(key);

    if (!stakeholderId) {
      throw new Error(`${key} stakeholder is required for demo seeding.`);
    }

    return stakeholderId;
  }

  const procurementOfficer = requireDemoProfile("PROC-001");
  const financeOfficer = requireDemoProfile("FIN-001");
  const vendor = requireDemoProfile("VEND-001");
  const procurementOfficerHash = createEmployeeHash(procurementOfficer.employmentId);
  const financeOfficerHash = createEmployeeHash(financeOfficer.employmentId);
  const vendorHash = createEmployeeHash(vendor.employmentId);

  const tender = await prisma.tender.upsert({
    where: { tenderCode: demoTenderCode },
    update: {
      agency: "Ministry of Finance",
      currentState: "TECHNICAL_EVALUATION",
      currentVersion: 1,
      createdByEmployeeHash: procurementOfficerHash,
      createdByRole: "PROCUREMENT_OFFICER",
      createdTxHash: demoTenderTxHash
    },
    create: {
      id: demoTenderId,
      tenderCode: demoTenderCode,
      agency: "Ministry of Finance",
      currentState: "TECHNICAL_EVALUATION",
      currentVersion: 1,
      createdByEmployeeHash: procurementOfficerHash,
      createdByRole: "PROCUREMENT_OFFICER",
      createdTxHash: demoTenderTxHash
    }
  });

  await prisma.tenderVersion.upsert({
    where: {
      tenderId_versionNumber: {
        tenderId: tender.id,
        versionNumber: 1
      }
    },
    update: {
      title: "Demo Bridge Maintenance Tender",
      description: "Seeded demo tender used to verify append-only procurement state and audit setup.",
      documentHash: demoDocumentHash,
      ipfsCid: "mock-cid-demo-tender-v1",
      changeReason: "Initial seeded version",
      createdByEmployeeHash: procurementOfficerHash,
      createdByRole: "PROCUREMENT_OFFICER",
      txHash: demoTenderTxHash
    },
    create: {
      tenderId: tender.id,
      versionNumber: 1,
      title: "Demo Bridge Maintenance Tender",
      description: "Seeded demo tender used to verify append-only procurement state and audit setup.",
      documentHash: demoDocumentHash,
      ipfsCid: "mock-cid-demo-tender-v1",
      changeReason: "Initial seeded version",
      createdByEmployeeHash: procurementOfficerHash,
      createdByRole: "PROCUREMENT_OFFICER",
      txHash: demoTenderTxHash
    }
  });

  const assignmentSeeds = [
    { stakeholderKey: "procurementOfficer", role: "PROCUREMENT_OFFICER" },
    { stakeholderKey: "vendor", role: "VENDOR" },
    { stakeholderKey: "tecMember", role: "EVALUATOR" },
    { stakeholderKey: "tecMember", role: "TEC_MEMBER" },
    { stakeholderKey: "tecChair", role: "TEC_CHAIR" },
    { stakeholderKey: "approvingOfficer", role: "APPROVING_OFFICER" },
    { stakeholderKey: "secondApprovingOfficer", role: "APPROVING_OFFICER" },
    { stakeholderKey: "financeOfficer", role: "FINANCE_OFFICER" },
    { stakeholderKey: "financialInstitutionOfficer", role: "FINANCIAL_INSTITUTION_OFFICER" },
    { stakeholderKey: "auditor", role: "AUDITOR" }
  ] as const;

  for (const assignmentSeed of assignmentSeeds) {
    await prisma.tenderRoleAssignment.upsert({
      where: {
        tenderId_stakeholderId_role: {
          tenderId: tender.id,
          stakeholderId: requireStakeholder(assignmentSeed.stakeholderKey),
          role: assignmentSeed.role
        }
      },
      update: {
        status: "ACTIVE",
        assignedByEmployeeHash: procurementOfficerHash,
        revokedAt: null,
        metadata: {
          seeded: true,
          tenderCode: demoTenderCode
        }
      },
      create: {
        tenderId: tender.id,
        stakeholderId: requireStakeholder(assignmentSeed.stakeholderKey),
        role: assignmentSeed.role,
        status: "ACTIVE",
        assignedByEmployeeHash: procurementOfficerHash,
        activatedAt: new Date(),
        metadata: {
          seeded: true,
          tenderCode: demoTenderCode
        }
      }
    });
  }

  const manifest = await prisma.tenderManifest.upsert({
    where: {
      tenderId_versionNumber: {
        tenderId: tender.id,
        versionNumber: 1
      }
    },
    update: {
      manifestHash: stableHash(`${demoTenderCode}:manifest:v1`),
      rulesHash: stableHash(`${demoTenderCode}:rules:v1`),
      criteriaHash: stableHash(`${demoTenderCode}:criteria:v1`),
      documentsHash: demoDocumentHash,
      approvalPolicy: {
        publicationThreshold: 2,
        awardApprovalThreshold: 2,
        requiredRoles: ["PROCUREMENT_OFFICER", "APPROVING_OFFICER"],
        envelopeOpeningOrder: ["ELIGIBILITY", "TECHNICAL", "FINANCIAL"]
      },
      publicationThreshold: 2,
      status: "ACTIVE",
      createdByEmployeeHash: procurementOfficerHash,
      createdByRole: "PROCUREMENT_OFFICER",
      txHash: demoTenderTxHash,
      blockchainStatus: "MOCK_CONFIRMED"
    },
    create: {
      id: demoManifestId,
      tenderId: tender.id,
      versionNumber: 1,
      manifestHash: stableHash(`${demoTenderCode}:manifest:v1`),
      rulesHash: stableHash(`${demoTenderCode}:rules:v1`),
      criteriaHash: stableHash(`${demoTenderCode}:criteria:v1`),
      documentsHash: demoDocumentHash,
      approvalPolicy: {
        publicationThreshold: 2,
        awardApprovalThreshold: 2,
        requiredRoles: ["PROCUREMENT_OFFICER", "APPROVING_OFFICER"],
        envelopeOpeningOrder: ["ELIGIBILITY", "TECHNICAL", "FINANCIAL"]
      },
      publicationThreshold: 2,
      status: "ACTIVE",
      createdByEmployeeHash: procurementOfficerHash,
      createdByRole: "PROCUREMENT_OFFICER",
      txHash: demoTenderTxHash,
      blockchainStatus: "MOCK_CONFIRMED"
    }
  });

  const publicationApprovals = [
    {
      approverStakeholderId: requireStakeholder("procurementOfficer"),
      approverEmployeeHash: procurementOfficerHash,
      approverRole: "PROCUREMENT_OFFICER",
      signatureHash: stableHash(`${demoTenderCode}:publication:procurement-officer`)
    },
    {
      approverStakeholderId: requireStakeholder("approvingOfficer"),
      approverEmployeeHash: createEmployeeHash("APP-001"),
      approverRole: "APPROVING_OFFICER",
      signatureHash: stableHash(`${demoTenderCode}:publication:approving-officer`)
    }
  ] as const;

  for (const approvalSeed of publicationApprovals) {
    await prisma.tenderPublicationApproval.upsert({
      where: {
        manifestId_approverEmployeeHash: {
          manifestId: manifest.id,
          approverEmployeeHash: approvalSeed.approverEmployeeHash
        }
      },
      update: {
        tenderId: tender.id,
        approverStakeholderId: approvalSeed.approverStakeholderId,
        approverRole: approvalSeed.approverRole,
        decision: "APPROVED",
        signatureHash: approvalSeed.signatureHash,
        txHash: demoTenderTxHash,
        blockchainStatus: "MOCK_CONFIRMED"
      },
      create: {
        tenderId: tender.id,
        manifestId: manifest.id,
        approverStakeholderId: approvalSeed.approverStakeholderId,
        approverEmployeeHash: approvalSeed.approverEmployeeHash,
        approverRole: approvalSeed.approverRole,
        decision: "APPROVED",
        signatureHash: approvalSeed.signatureHash,
        txHash: demoTenderTxHash,
        blockchainStatus: "MOCK_CONFIRMED"
      }
    });
  }

  const proposalPackage = await prisma.proposalPackage.upsert({
    where: {
      tenderId_vendorEmployeeHash: {
        tenderId: tender.id,
        vendorEmployeeHash: vendorHash
      }
    },
    update: {
      vendorStakeholderId: requireStakeholder("vendor"),
      packageHash: stableHash(`${demoTenderCode}:proposal-package:vendor`),
      status: "SUBMITTED",
      submittedAt: new Date(),
      txHash: "0xmockseedproposalpackage0000000000000000000000000000000000000000",
      blockchainStatus: "MOCK_CONFIRMED"
    },
    create: {
      id: demoProposalPackageId,
      tenderId: tender.id,
      vendorStakeholderId: requireStakeholder("vendor"),
      vendorEmployeeHash: vendorHash,
      packageHash: stableHash(`${demoTenderCode}:proposal-package:vendor`),
      status: "SUBMITTED",
      submittedAt: new Date(),
      txHash: "0xmockseedproposalpackage0000000000000000000000000000000000000000",
      blockchainStatus: "MOCK_CONFIRMED"
    }
  });

  const envelopeSeeds = [
    { envelopeType: "ELIGIBILITY", keyId: "kms-demo-eligibility-v1" },
    { envelopeType: "TECHNICAL", keyId: "kms-demo-technical-v1" },
    { envelopeType: "FINANCIAL", keyId: "kms-demo-financial-v1" },
    { envelopeType: "SUPPORTING_DOCUMENTS", keyId: "kms-demo-supporting-v1" },
    { envelopeType: "TENDER_SECURITY", keyId: "kms-demo-security-v1" }
  ] as const;
  const envelopes = new Map<string, string>();
  const encryptedFileReferences = new Map<string, string>();

  for (const envelopeSeed of envelopeSeeds) {
    const envelope = await prisma.proposalEnvelope.upsert({
      where: {
        proposalPackageId_envelopeType: {
          proposalPackageId: proposalPackage.id,
          envelopeType: envelopeSeed.envelopeType
        }
      },
      update: {
        encryptedFileHash: stableHash(`${demoTenderCode}:encrypted:${envelopeSeed.envelopeType}`),
        envelopeManifestHash: stableHash(`${demoTenderCode}:envelope-manifest:${envelopeSeed.envelopeType}`),
        encryptionAlgorithm: "AES-256-GCM",
        keyId: envelopeSeed.keyId,
        storageReference: `mock-storage://${demoTenderCode}/${envelopeSeed.envelopeType.toLowerCase()}.enc`,
        ipfsCid: `mock-cid-${demoTenderCode.toLowerCase()}-${envelopeSeed.envelopeType.toLowerCase()}`,
        txHash: "0xmockseedenvelopecommit000000000000000000000000000000000000000",
        blockchainStatus: "MOCK_CONFIRMED"
      },
      create: {
        proposalPackageId: proposalPackage.id,
        envelopeType: envelopeSeed.envelopeType,
        encryptedFileHash: stableHash(`${demoTenderCode}:encrypted:${envelopeSeed.envelopeType}`),
        envelopeManifestHash: stableHash(`${demoTenderCode}:envelope-manifest:${envelopeSeed.envelopeType}`),
        encryptionAlgorithm: "AES-256-GCM",
        keyId: envelopeSeed.keyId,
        storageReference: `mock-storage://${demoTenderCode}/${envelopeSeed.envelopeType.toLowerCase()}.enc`,
        ipfsCid: `mock-cid-${demoTenderCode.toLowerCase()}-${envelopeSeed.envelopeType.toLowerCase()}`,
        txHash: "0xmockseedenvelopecommit000000000000000000000000000000000000000",
        blockchainStatus: "MOCK_CONFIRMED"
      }
    });

    envelopes.set(envelopeSeed.envelopeType, envelope.id);

    const encryptedFileReference = await prisma.encryptedFileReference.upsert({
      where: {
        storageKey: `${demoTenderCode}/${envelopeSeed.envelopeType.toLowerCase()}.enc`
      },
      update: {
        tenderId: tender.id,
        proposalEnvelopeId: envelope.id,
        storageProvider: "mock",
        encryptedFileHash: stableHash(`${demoTenderCode}:encrypted:${envelopeSeed.envelopeType}`),
        contentType: "application/octet-stream",
        byteSize: 4096,
        originalFilename: `${envelopeSeed.envelopeType.toLowerCase()}-proposal.pdf.enc`,
        encryptionAlgorithm: "AES-256-GCM"
      },
      create: {
        tenderId: tender.id,
        proposalEnvelopeId: envelope.id,
        storageProvider: "mock",
        storageKey: `${demoTenderCode}/${envelopeSeed.envelopeType.toLowerCase()}.enc`,
        encryptedFileHash: stableHash(`${demoTenderCode}:encrypted:${envelopeSeed.envelopeType}`),
        contentType: "application/octet-stream",
        byteSize: 4096,
        originalFilename: `${envelopeSeed.envelopeType.toLowerCase()}-proposal.pdf.enc`,
        encryptionAlgorithm: "AES-256-GCM"
      }
    });

    encryptedFileReferences.set(envelopeSeed.envelopeType, encryptedFileReference.id);
  }

  const legacyRecordSeeds = [
    {
      legacyRecordId: "legacy-egp-demo-tender-published",
      recordType: "TENDER_OPERATION",
      operation: "TENDER_PUBLISHED_IN_OLD_EGP_SIMULATOR",
      operationalStatus: "SYNCED",
      encryptedFileReferenceId: null,
      trustLayerTxHash: demoTenderTxHash,
      blockchainStatus: "MOCK_CONFIRMED",
      metadata: {
        tenderCode: demoTenderCode,
        simulatorOnly: true,
        productionEgpApi: false
      }
    },
    {
      legacyRecordId: "legacy-egp-demo-technical-envelope",
      recordType: "PROPOSAL_STORAGE",
      operation: "ENCRYPTED_TECHNICAL_ENVELOPE_STORED",
      operationalStatus: "ENCRYPTED_REFERENCE_ONLY",
      encryptedFileReferenceId: encryptedFileReferences.get("TECHNICAL") ?? null,
      trustLayerTxHash: "0xmockseedenvelopecommit000000000000000000000000000000000000000",
      blockchainStatus: "MOCK_CONFIRMED",
      metadata: {
        tenderCode: demoTenderCode,
        envelopeType: "TECHNICAL",
        storageMode: "encrypted-reference-only",
        plaintextStored: false
      }
    },
    {
      legacyRecordId: "legacy-egp-demo-award-proof",
      recordType: "AWARD_UPDATE",
      operation: "AWARD_APPROVAL_PROOF_LINKED",
      operationalStatus: "TRUST_LAYER_TX_REFERENCED",
      encryptedFileReferenceId: null,
      trustLayerTxHash: "0xmockseedawardapproval000000000000000000000000000000000000000",
      blockchainStatus: "MOCK_CONFIRMED",
      metadata: {
        tenderCode: demoTenderCode,
        thresholdApproval: true,
        source: "simulated old-system operational record"
      }
    }
  ] as const;

  for (const legacyRecordSeed of legacyRecordSeeds) {
    await prisma.legacyEgpRecord.upsert({
      where: {
        legacyRecordId: legacyRecordSeed.legacyRecordId
      },
      update: {
        sourceSystem: "EGP_SIMULATOR",
        tenderId: tender.id,
        recordType: legacyRecordSeed.recordType,
        operation: legacyRecordSeed.operation,
        operationalStatus: legacyRecordSeed.operationalStatus,
        encryptedFileReferenceId: legacyRecordSeed.encryptedFileReferenceId,
        trustLayerTxHash: legacyRecordSeed.trustLayerTxHash,
        blockchainStatus: legacyRecordSeed.blockchainStatus,
        metadataHash: stableHash(JSON.stringify(legacyRecordSeed.metadata)),
        metadata: legacyRecordSeed.metadata,
        legacyCreatedAt: new Date("2026-01-01T00:00:00.000Z")
      },
      create: {
        sourceSystem: "EGP_SIMULATOR",
        legacyRecordId: legacyRecordSeed.legacyRecordId,
        tenderId: tender.id,
        recordType: legacyRecordSeed.recordType,
        operation: legacyRecordSeed.operation,
        operationalStatus: legacyRecordSeed.operationalStatus,
        encryptedFileReferenceId: legacyRecordSeed.encryptedFileReferenceId,
        trustLayerTxHash: legacyRecordSeed.trustLayerTxHash,
        blockchainStatus: legacyRecordSeed.blockchainStatus,
        metadataHash: stableHash(JSON.stringify(legacyRecordSeed.metadata)),
        metadata: legacyRecordSeed.metadata,
        legacyCreatedAt: new Date("2026-01-01T00:00:00.000Z")
      }
    });
  }

  const keyReleasePolicies = [
    {
      envelopeType: "ELIGIBILITY",
      allowedRole: "TEC_MEMBER",
      requiredTenderState: "TECHNICAL_EVALUATION"
    },
    {
      envelopeType: "TECHNICAL",
      allowedRole: "TEC_MEMBER",
      requiredTenderState: "TECHNICAL_EVALUATION"
    },
    {
      envelopeType: "TECHNICAL",
      allowedRole: "TEC_CHAIR",
      requiredTenderState: "TECHNICAL_EVALUATION"
    },
    {
      envelopeType: "SUPPORTING_DOCUMENTS",
      allowedRole: "TEC_MEMBER",
      requiredTenderState: "TECHNICAL_EVALUATION"
    },
    {
      envelopeType: "SUPPORTING_DOCUMENTS",
      allowedRole: "TEC_CHAIR",
      requiredTenderState: "TECHNICAL_EVALUATION"
    },
    {
      envelopeType: "FINANCIAL",
      allowedRole: "FINANCIAL_INSTITUTION_OFFICER",
      requiredTenderState: "FINANCIAL_EVALUATION"
    },
    {
      envelopeType: "TENDER_SECURITY",
      allowedRole: "FINANCIAL_INSTITUTION_OFFICER",
      requiredTenderState: "AWARD_APPROVED"
    }
  ] as const;

  for (const policySeed of keyReleasePolicies) {
    await prisma.keyReleasePolicy.upsert({
      where: {
        tenderId_envelopeType_allowedRole_requiredTenderState: {
          tenderId: tender.id,
          envelopeType: policySeed.envelopeType,
          allowedRole: policySeed.allowedRole,
          requiredTenderState: policySeed.requiredTenderState
        }
      },
      update: {
        proposalEnvelopeId: envelopes.get(policySeed.envelopeType),
        requiresIntegrityCheck: true,
        isActive: true
      },
      create: {
        tenderId: tender.id,
        proposalEnvelopeId: envelopes.get(policySeed.envelopeType),
        envelopeType: policySeed.envelopeType,
        allowedRole: policySeed.allowedRole,
        requiredTenderState: policySeed.requiredTenderState,
        requiresIntegrityCheck: true,
        isActive: true
      }
    });
  }

  const technicalEnvelopeId = envelopes.get("TECHNICAL");

  if (!technicalEnvelopeId) {
    throw new Error("TECHNICAL proposal envelope is required for demo seeding.");
  }

  const technicalPolicy = await prisma.keyReleasePolicy.findFirstOrThrow({
    where: {
      tenderId: tender.id,
      envelopeType: "TECHNICAL",
      allowedRole: "TEC_MEMBER",
      requiredTenderState: "TECHNICAL_EVALUATION"
    }
  });

  await prisma.keyReleaseRequest.upsert({
    where: { id: "key-release-request-demo-technical" },
    update: {
      tenderId: tender.id,
      proposalEnvelopeId: technicalEnvelopeId,
      policyId: technicalPolicy.id,
      requesterStakeholderId: requireStakeholder("tecMember"),
      requesterEmployeeHash: createEmployeeHash("TEC-001"),
      requesterRole: "TEC_MEMBER",
      requestedTenderState: "TECHNICAL_EVALUATION",
      status: "REQUESTED",
      rejectionReason: null,
      keyMaterialReference: null,
      releasedAt: null
    },
    create: {
      id: "key-release-request-demo-technical",
      tenderId: tender.id,
      proposalEnvelopeId: technicalEnvelopeId,
      policyId: technicalPolicy.id,
      requesterStakeholderId: requireStakeholder("tecMember"),
      requesterEmployeeHash: createEmployeeHash("TEC-001"),
      requesterRole: "TEC_MEMBER",
      requestedTenderState: "TECHNICAL_EVALUATION",
      status: "REQUESTED",
      keyMaterialReference: null,
      releasedAt: null
    }
  });

  const conflictDeclarations = [
    {
      stakeholderKey: "tecMember",
      actorEmployeeHash: createEmployeeHash("TEC-001"),
      actorRole: "TEC_MEMBER",
      declarationStatus: "DECLARED_NO_CONFLICT"
    },
    {
      stakeholderKey: "tecChair",
      actorEmployeeHash: createEmployeeHash("TEC-CHAIR-001"),
      actorRole: "TEC_CHAIR",
      declarationStatus: "DECLARED_NO_CONFLICT"
    }
  ] as const;

  for (const declarationSeed of conflictDeclarations) {
    await prisma.conflictOfInterestDeclaration.upsert({
      where: {
        tenderId_actorEmployeeHash: {
          tenderId: tender.id,
          actorEmployeeHash: declarationSeed.actorEmployeeHash
        }
      },
      update: {
        stakeholderId: requireStakeholder(declarationSeed.stakeholderKey),
        actorRole: declarationSeed.actorRole,
        declarationStatus: declarationSeed.declarationStatus,
        declarationHash: stableHash(`${demoTenderCode}:coi:${declarationSeed.actorEmployeeHash}`),
        txHash: "0xmockseedconflictdeclare00000000000000000000000000000000000000",
        blockchainStatus: "MOCK_CONFIRMED"
      },
      create: {
        tenderId: tender.id,
        stakeholderId: requireStakeholder(declarationSeed.stakeholderKey),
        actorEmployeeHash: declarationSeed.actorEmployeeHash,
        actorRole: declarationSeed.actorRole,
        declarationStatus: declarationSeed.declarationStatus,
        declarationHash: stableHash(`${demoTenderCode}:coi:${declarationSeed.actorEmployeeHash}`),
        txHash: "0xmockseedconflictdeclare00000000000000000000000000000000000000",
        blockchainStatus: "MOCK_CONFIRMED"
      }
    });
  }

  const evaluationReport = await prisma.evaluationReport.upsert({
    where: {
      tenderId_reportHash: {
        tenderId: tender.id,
        reportHash: stableHash(`${demoTenderCode}:evaluation-report:v1`)
      }
    },
    update: {
      chairStakeholderId: requireStakeholder("tecChair"),
      technicalScoreHash: stableHash(`${demoTenderCode}:technical-score:v1`),
      financialScoreHash: stableHash(`${demoTenderCode}:financial-score:v1`),
      status: "SUBMITTED",
      submittedByEmployeeHash: createEmployeeHash("TEC-CHAIR-001"),
      submittedByRole: "TEC_CHAIR",
      txHash: "0xmockseedevaluationreport0000000000000000000000000000000000000",
      blockchainStatus: "MOCK_CONFIRMED"
    },
    create: {
      id: demoEvaluationReportId,
      tenderId: tender.id,
      chairStakeholderId: requireStakeholder("tecChair"),
      reportHash: stableHash(`${demoTenderCode}:evaluation-report:v1`),
      technicalScoreHash: stableHash(`${demoTenderCode}:technical-score:v1`),
      financialScoreHash: stableHash(`${demoTenderCode}:financial-score:v1`),
      status: "SUBMITTED",
      submittedByEmployeeHash: createEmployeeHash("TEC-CHAIR-001"),
      submittedByRole: "TEC_CHAIR",
      txHash: "0xmockseedevaluationreport0000000000000000000000000000000000000",
      blockchainStatus: "MOCK_CONFIRMED"
    }
  });

  const awardRecommendation = await prisma.awardRecommendation.upsert({
    where: {
      tenderId_recommendationHash: {
        tenderId: tender.id,
        recommendationHash: stableHash(`${demoTenderCode}:award-recommendation:v1`)
      }
    },
    update: {
      evaluationReportId: evaluationReport.id,
      recommendedVendorStakeholderId: requireStakeholder("vendor"),
      submittedByEmployeeHash: createEmployeeHash("TEC-CHAIR-001"),
      submittedByRole: "TEC_CHAIR",
      status: "APPROVAL_PENDING",
      txHash: "0xmockseedawardrecommend00000000000000000000000000000000000000",
      blockchainStatus: "MOCK_CONFIRMED"
    },
    create: {
      id: demoAwardRecommendationId,
      tenderId: tender.id,
      evaluationReportId: evaluationReport.id,
      recommendedVendorStakeholderId: requireStakeholder("vendor"),
      recommendationHash: stableHash(`${demoTenderCode}:award-recommendation:v1`),
      submittedByEmployeeHash: createEmployeeHash("TEC-CHAIR-001"),
      submittedByRole: "TEC_CHAIR",
      status: "APPROVAL_PENDING",
      txHash: "0xmockseedawardrecommend00000000000000000000000000000000000000",
      blockchainStatus: "MOCK_CONFIRMED"
    }
  });

  await prisma.awardApproval.upsert({
    where: {
      awardRecommendationId_approverEmployeeHash: {
        awardRecommendationId: awardRecommendation.id,
        approverEmployeeHash: createEmployeeHash("APP-001")
      }
    },
    update: {
      tenderId: tender.id,
      approverStakeholderId: requireStakeholder("approvingOfficer"),
      approverRole: "APPROVING_OFFICER",
      decision: "APPROVED",
      signatureHash: stableHash(`${demoTenderCode}:award-approval:approving-officer`),
      txHash: "0xmockseedawardapproval000000000000000000000000000000000000000",
      blockchainStatus: "MOCK_CONFIRMED"
    },
    create: {
      tenderId: tender.id,
      awardRecommendationId: awardRecommendation.id,
      approverStakeholderId: requireStakeholder("approvingOfficer"),
      approverEmployeeHash: createEmployeeHash("APP-001"),
      approverRole: "APPROVING_OFFICER",
      decision: "APPROVED",
      signatureHash: stableHash(`${demoTenderCode}:award-approval:approving-officer`),
      txHash: "0xmockseedawardapproval000000000000000000000000000000000000000",
      blockchainStatus: "MOCK_CONFIRMED"
    }
  });

  const publicProofs = [
    {
      id: "public-proof-demo-manifest",
      proofType: "TENDER_MANIFEST",
      proofHash: stableHash(`${demoTenderCode}:public:manifest`),
      sourceTxHash: demoTenderTxHash,
      publicLabel: "Tender manifest committed"
    },
    {
      id: "public-proof-demo-proposal-package",
      proofType: "PROPOSAL_PACKAGE",
      proofHash: stableHash(`${demoTenderCode}:public:proposal-package`),
      sourceTxHash: "0xmockseedproposalpackage0000000000000000000000000000000000000000",
      publicLabel: "Vendor proposal package commitment"
    },
    {
      id: "public-proof-demo-technical-envelope",
      proofType: "ENVELOPE_COMMITMENT",
      proofHash: stableHash(`${demoTenderCode}:public:technical-envelope`),
      sourceTxHash: "0xmockseedtechenvelope000000000000000000000000000000000000000",
      publicLabel: "Technical envelope commitment"
    },
    {
      id: "public-proof-demo-financial-envelope",
      proofType: "ENVELOPE_COMMITMENT",
      proofHash: stableHash(`${demoTenderCode}:public:financial-envelope`),
      sourceTxHash: "0xmockseedfinenvelope0000000000000000000000000000000000000000",
      publicLabel: "Financial envelope commitment"
    },
    {
      id: "public-proof-demo-technical-key-release",
      proofType: "KEY_RELEASE",
      proofHash: stableHash(`${demoTenderCode}:public:key-release:technical`),
      sourceTxHash: "0xmockseedkeyrelease0000000000000000000000000000000000000000",
      publicLabel: "Technical key release proof"
    },
    {
      id: "public-proof-demo-evaluation-report",
      proofType: "EVALUATION_REPORT",
      proofHash: stableHash(`${demoTenderCode}:public:evaluation-report`),
      sourceTxHash: "0xmockseedevaluationreport000000000000000000000000000000000000",
      publicLabel: "Evaluation report proof"
    },
    {
      id: "public-proof-demo-award-recommendation",
      proofType: "AWARD_RECOMMENDATION",
      proofHash: stableHash(`${demoTenderCode}:public:award-recommendation`),
      sourceTxHash: "0xmockseedawardrecommend00000000000000000000000000000000000000",
      publicLabel: "Award recommendation committed"
    },
    {
      id: "public-proof-demo-award-approval",
      proofType: "AWARD_APPROVAL",
      proofHash: stableHash(`${demoTenderCode}:public:award-approval:approving-officer`),
      sourceTxHash: "0xmockseedawardapproval000000000000000000000000000000000000000",
      publicLabel: "Award approval proof"
    }
  ] as const;

  for (const proofSeed of publicProofs) {
    await prisma.publicAuditProof.upsert({
      where: { id: proofSeed.id },
      update: {
        tenderId: tender.id,
        proofType: proofSeed.proofType,
        proofHash: proofSeed.proofHash,
        sourceTxHash: proofSeed.sourceTxHash,
        blockchainStatus: "MOCK_CONFIRMED",
        publicLabel: proofSeed.publicLabel,
        metadata: {
          seeded: true,
          tenderCode: demoTenderCode,
          privacy: "No raw Employment ID or proposal content is exposed in this public proof."
        }
      },
      create: {
        id: proofSeed.id,
        tenderId: tender.id,
        proofType: proofSeed.proofType,
        proofHash: proofSeed.proofHash,
        sourceTxHash: proofSeed.sourceTxHash,
        blockchainStatus: "MOCK_CONFIRMED",
        publicLabel: proofSeed.publicLabel,
        metadata: {
          seeded: true,
          tenderCode: demoTenderCode,
          privacy: "No raw Employment ID or proposal content is exposed in this public proof."
        }
      }
    });
  }

  const existingTransition = await prisma.procurementTransition.findFirst({
    where: {
      tenderId: tender.id,
      action: "CREATE_TENDER",
      allowed: true
    }
  });

  if (!existingTransition) {
    await prisma.procurementTransition.create({
      data: {
        tenderId: tender.id,
        action: "CREATE_TENDER",
        actorEmployeeHash: procurementOfficerHash,
        actorRole: "PROCUREMENT_OFFICER",
        fromState: null,
        toState: "CREATED",
        allowed: true,
        txHash: demoTenderTxHash,
        metadata: {
          seeded: true,
          tenderCode: demoTenderCode
        }
      }
    });
  }

  const existingFinanceBlockedTransition = await prisma.procurementTransition.findFirst({
    where: {
      tenderId: tender.id,
      action: "APPROVE_PAYMENT",
      actorEmployeeHash: financeOfficerHash,
      allowed: false,
      rejectionReason: "EVALUATION_REQUIRED_BEFORE_PAYMENT"
    }
  });

  if (!existingFinanceBlockedTransition) {
    await prisma.procurementTransition.create({
      data: {
        tenderId: tender.id,
        action: "APPROVE_PAYMENT",
        actorEmployeeHash: financeOfficerHash,
        actorRole: "FINANCE_OFFICER",
        fromState: "CREATED",
        toState: null,
        allowed: false,
        rejectionReason: "EVALUATION_REQUIRED_BEFORE_PAYMENT",
        metadata: {
          seeded: true,
          tenderCode: demoTenderCode,
          demoEvidence: "Finance cannot approve payment before evaluation approval."
        }
      }
    });
  }

  const existingVendorBlockedTransition = await prisma.procurementTransition.findFirst({
    where: {
      tenderId: tender.id,
      action: "APPROVE_PAYMENT",
      actorEmployeeHash: vendorHash,
      allowed: false,
      rejectionReason: "ROLE_NOT_ALLOWED"
    }
  });

  if (!existingVendorBlockedTransition) {
    await prisma.procurementTransition.create({
      data: {
        tenderId: tender.id,
        action: "APPROVE_PAYMENT",
        actorEmployeeHash: vendorHash,
        actorRole: "VENDOR",
        fromState: "CREATED",
        toState: null,
        allowed: false,
        rejectionReason: "ROLE_NOT_ALLOWED",
        metadata: {
          seeded: true,
          tenderCode: demoTenderCode,
          demoEvidence: "Vendor cannot approve restricted payment actions."
        }
      }
    });
  }

  await prisma.blockchainTransaction.upsert({
    where: { txHash: demoTenderTxHash },
    update: {
      network: "mock",
      chainId: 31337,
      action: "TENDER_CREATED",
      resourceType: "TENDER",
      resourceId: tender.id,
      tenderId: tender.id,
      contractAddress: "mock-contract",
      relayerAddress: "mock-relayer",
      status: "MOCK_CONFIRMED",
      blockNumber: 0,
      explorerUrl: null,
      confirmedAt: new Date()
    },
    create: {
      txHash: demoTenderTxHash,
      network: "mock",
      chainId: 31337,
      action: "TENDER_CREATED",
      resourceType: "TENDER",
      resourceId: tender.id,
      tenderId: tender.id,
      contractAddress: "mock-contract",
      relayerAddress: "mock-relayer",
      status: "MOCK_CONFIRMED",
      blockNumber: 0,
      explorerUrl: null,
      confirmedAt: new Date()
    }
  });

  const existingTenderAudit = await prisma.auditLog.findFirst({
    where: {
      action: "TENDER_CREATED",
      tenderId: tender.id,
      status: "MOCK_CHAIN_CONFIRMED"
    }
  });

  if (!existingTenderAudit) {
    await prisma.auditLog.create({
      data: {
        action: "TENDER_CREATED",
        status: "MOCK_CHAIN_CONFIRMED",
        actorEmployeeHash: procurementOfficerHash,
        actorRole: "PROCUREMENT_OFFICER",
        actorHolderDID: procurementOfficer.holderDID,
        actorEmployer: procurementOfficer.employer,
        actorPosition: procurementOfficer.position,
        resourceType: "TENDER",
        resourceId: tender.id,
        tenderId: tender.id,
        fromState: null,
        toState: "CREATED",
        permissionChecked: "CREATE_TENDER",
        permissionResult: "ALLOWED",
        transitionAllowed: true,
        documentHash: demoDocumentHash,
        ipfsCid: "mock-cid-demo-tender-v1",
        txHash: demoTenderTxHash,
        blockNumber: 0,
        chainId: 31337,
        contractAddress: "mock-contract",
        relayerAddress: "mock-relayer",
        blockchainStatus: "MOCK_CONFIRMED",
        metadata: {
          seeded: true,
          tenderCode: demoTenderCode
        }
      }
    });
  }

  const existingFinanceBlockedAudit = await prisma.auditLog.findFirst({
    where: {
      action: "INVALID_TRANSITION_ATTEMPTED",
      tenderId: tender.id,
      actorEmployeeHash: financeOfficerHash,
      rejectionReason: "EVALUATION_REQUIRED_BEFORE_PAYMENT"
    }
  });

  if (!existingFinanceBlockedAudit) {
    await prisma.auditLog.create({
      data: {
        action: "INVALID_TRANSITION_ATTEMPTED",
        status: "BLOCKED",
        actorEmployeeHash: financeOfficerHash,
        actorRole: "FINANCE_OFFICER",
        actorHolderDID: financeOfficer.holderDID,
        actorEmployer: financeOfficer.employer,
        actorPosition: financeOfficer.position,
        resourceType: "TENDER",
        resourceId: tender.id,
        tenderId: tender.id,
        fromState: "CREATED",
        toState: null,
        permissionChecked: "APPROVE_PAYMENT",
        permissionResult: "ALLOWED",
        transitionAllowed: false,
        rejectionReason: "EVALUATION_REQUIRED_BEFORE_PAYMENT",
        blockchainStatus: "NOT_SUBMITTED",
        metadata: {
          seeded: true,
          tenderCode: demoTenderCode,
          demoEvidence: "Finance-before-evaluation bypass attempt is visible after reset."
        }
      }
    });
  }

  const existingVendorBlockedAudit = await prisma.auditLog.findFirst({
    where: {
      action: "UNAUTHORIZED_ACTION_ATTEMPTED",
      tenderId: tender.id,
      actorEmployeeHash: vendorHash,
      rejectionReason: "ROLE_NOT_ALLOWED"
    }
  });

  if (!existingVendorBlockedAudit) {
    await prisma.auditLog.create({
      data: {
        action: "UNAUTHORIZED_ACTION_ATTEMPTED",
        status: "BLOCKED",
        actorEmployeeHash: vendorHash,
        actorRole: "VENDOR",
        actorHolderDID: vendor.holderDID,
        actorEmployer: vendor.employer,
        actorPosition: vendor.position,
        resourceType: "TENDER",
        resourceId: tender.id,
        tenderId: tender.id,
        fromState: "CREATED",
        toState: null,
        permissionChecked: "APPROVE_PAYMENT",
        permissionResult: "DENIED",
        transitionAllowed: false,
        rejectionReason: "ROLE_NOT_ALLOWED",
        blockchainStatus: "NOT_SUBMITTED",
        metadata: {
          seeded: true,
          tenderCode: demoTenderCode,
          demoEvidence: "Vendor payment approval attempt is blocked and logged after reset."
        }
      }
    });
  }

  const existingSeedAudit = await prisma.auditLog.findFirst({
    where: {
      action: "DEMO_SEED_COMPLETED",
      resourceType: "SYSTEM"
    }
  });

  if (!existingSeedAudit) {
    await prisma.auditLog.create({
      data: {
        action: "DEMO_SEED_COMPLETED",
        status: "SUCCESS",
        resourceType: "SYSTEM",
        metadata: {
          seededProfiles: demoProfiles.length,
          demoTenderCode,
          note: "Seeded mock NDI profiles, role permissions, and optional demo tender."
        }
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
