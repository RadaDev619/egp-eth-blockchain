import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { publicDemoProfiles } from "../config/demoProfiles.js";
import { createEmployeeHash } from "./employeeHashService.js";
import { getDemoProfileByEmploymentId, mapEmploymentToRole } from "./roleMappingService.js";
import { createSession } from "./sessionService.js";
import { logNdiProofValidated, logRoleMapped } from "./auditService.js";
import { getPermissionsForRole } from "./rbacService.js";
import { normalizeNdiProofEvent } from "./ndiEventService.js";
import { prisma } from "../utils/prisma.js";
import { AuthorizationError, ValidationError } from "../utils/errors.js";

const requestedAttributes = ["Employment ID", "Position", "Employment Type", "Employer"];

type AuditRequestContext = {
  route?: string;
  httpMethod?: string;
  requestId?: string;
};

export async function startNdiLogin() {
  const threadId = `mock-thread-${randomUUID()}`;
  const proofRequest = await prisma.nDIProofRequest.create({
    data: {
      threadId,
      proofName: "e-GP Trust Layer Employment Login",
      purpose: "login",
      status: "PENDING",
      transport: env.NDI_MODE,
      requestedAttributes,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    }
  });

  const proofRequestURL = `mock-ndi://proof-request/${proofRequest.threadId}`;
  const deepLinkURL = `bhutanndi://proof-request/${proofRequest.threadId}`;

  return {
    mode: env.NDI_MODE,
    proofRequestThreadId: proofRequest.threadId,
    threadId: proofRequest.threadId,
    proofRequestURL,
    proofRequestUrl: proofRequestURL,
    deepLinkURL,
    deepLinkUrl: deepLinkURL,
    qrData: `mock-ndi-proof:${proofRequest.threadId}`,
    requestedAttributes,
    demoProfiles: env.NDI_MODE === "mock" ? publicDemoProfiles() : []
  };
}

export async function completeMockNdiLogin(
  threadId: string,
  employmentId: string,
  auditContext: AuditRequestContext = {}
) {
  if (env.NDI_MODE !== "mock") {
    throw new ValidationError("Mock NDI completion is available only when NDI_MODE=mock.");
  }

  const proofRequest = await prisma.nDIProofRequest.findUnique({ where: { threadId } });

  if (!proofRequest || proofRequest.expiresAt < new Date()) {
    throw new AuthorizationError("NDI proof request is unknown or expired.");
  }

  if (proofRequest.status === "COMPLETED") {
    throw new AuthorizationError("NDI proof request has already been completed.");
  }

  const profile = getDemoProfileByEmploymentId(employmentId);
  const simulatedProofPayload = {
    verification_result: "ProofValidated",
    proofRequestThreadId: threadId,
    holderDID: profile.holderDID,
    requested_presentation: {
      revealed_attrs: {
        "Employment ID": { value: profile.employmentId },
        Position: { value: profile.position },
        "Employment Type": { value: profile.employmentType },
        Employer: { value: profile.employer }
      }
    }
  };
  const normalizedProof = normalizeNdiProofEvent(simulatedProofPayload);
  const attributes = normalizedProof.attributes;
  const role = mapEmploymentToRole({
    employmentId: attributes.employmentId,
    holderDID: normalizedProof.holderDID,
    employer: attributes.employer,
    position: attributes.position,
    employmentType: attributes.employmentType
  });
  const employeeHash = createEmployeeHash(attributes.employmentId);
  const permissions = getPermissionsForRole(role);

  const { user } = await prisma.$transaction(async (tx) => {
    const ndiProfile = await tx.nDIProfile.upsert({
      where: { employmentId: attributes.employmentId },
      update: {
        holderDID: normalizedProof.holderDID,
        employeeHash,
        employer: attributes.employer,
        position: attributes.position,
        employmentType: attributes.employmentType
      },
      create: {
        holderDID: normalizedProof.holderDID,
        employmentId: attributes.employmentId,
        employeeHash,
        employer: attributes.employer,
        position: attributes.position,
        employmentType: attributes.employmentType
      }
    });

    const user = await tx.user.upsert({
      where: { id: `${attributes.employmentId.toLowerCase()}-user` },
      update: {
        ndiProfileId: ndiProfile.id,
        role,
        isActive: true
      },
      create: {
        id: `${attributes.employmentId.toLowerCase()}-user`,
        ndiProfileId: ndiProfile.id,
        role
      }
    });

    await tx.nDIProofRequest.update({
      where: { threadId },
      data: {
        status: "COMPLETED",
        resultPayload: simulatedProofPayload,
        completedAt: new Date()
      }
    });

    return { user };
  });

  await logNdiProofValidated({
    actorEmployeeHash: employeeHash,
    actorRole: role,
    actorHolderDID: normalizedProof.holderDID,
    actorEmployer: attributes.employer,
    actorPosition: attributes.position,
    resourceType: "NDI_PROOF",
    resourceId: threadId,
    route: auditContext.route,
    httpMethod: auditContext.httpMethod,
    requestId: auditContext.requestId,
    metadata: {
      verificationResult: normalizedProof.verificationResult,
      requestedAttributes,
      revealedAttributeNames: requestedAttributes,
      mode: env.NDI_MODE
    }
  });

  await logRoleMapped({
    actorEmployeeHash: employeeHash,
    actorRole: role,
    actorHolderDID: normalizedProof.holderDID,
    actorEmployer: attributes.employer,
    actorPosition: attributes.position,
    resourceType: "AUTH_SESSION",
    resourceId: user.id,
    route: auditContext.route,
    httpMethod: auditContext.httpMethod,
    requestId: auditContext.requestId,
    metadata: {
      employer: attributes.employer,
      position: attributes.position,
      employmentType: attributes.employmentType,
      mappedRole: role
    }
  });

  const session = await createSession(user.id);

  return {
    session,
    proof: {
      proofRequestThreadId: normalizedProof.threadId,
      verificationResult: normalizedProof.verificationResult,
      status: "ProofValidated",
      requestedAttributes,
      revealedAttributeNames: requestedAttributes
    },
    user: {
      userId: user.id,
      holderDID: normalizedProof.holderDID,
      employmentId: attributes.employmentId,
      employeeHash,
      employer: attributes.employer,
      position: attributes.position,
      employmentType: attributes.employmentType,
      role,
      permissions
    }
  };
}
