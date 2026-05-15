import { PrismaClient, type Role } from "@prisma/client";
import { demoProfiles } from "../src/config/demoProfiles.js";
import { createEmployeeHash } from "../src/services/employeeHashService.js";
import { rolePermissions } from "../src/types/domain.js";

const prisma = new PrismaClient();
const demoTenderCode = "TDR-DEMO-001";
const demoTenderTxHash = "0xmockseedtendercreated000000000000000000000000000000000000000000000";
const demoDocumentHash = "0x8f3f20f6f5f07a52b93f9165134907de10bf51f4521c6f471df188d7f7bdb001";
const demoTenderId = "tender-demo-001";
const demoProfileIds: Record<string, string> = {
  "PROC-001": "ndi-profile-proc-001",
  "VEND-001": "ndi-profile-vend-001",
  "EVAL-001": "ndi-profile-eval-001",
  "FIN-001": "ndi-profile-fin-001",
  "AUD-001": "ndi-profile-aud-001"
};

function demoUserId(employmentId: string): string {
  return `${employmentId.toLowerCase()}-user`;
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
      currentState: "CREATED",
      currentVersion: 1,
      createdByEmployeeHash: procurementOfficerHash,
      createdByRole: "PROCUREMENT_OFFICER",
      createdTxHash: demoTenderTxHash
    },
    create: {
      id: demoTenderId,
      tenderCode: demoTenderCode,
      agency: "Ministry of Finance",
      currentState: "CREATED",
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
