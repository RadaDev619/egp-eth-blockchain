import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { getPermissionsForRole } from "./rbacService.js";
import { sha256Hex } from "../utils/hash.js";
import { prisma } from "../utils/prisma.js";
import { AuthorizationError } from "../utils/errors.js";
import type { AuthenticatedUser } from "../types/domain.js";

const SESSION_TTL_SECONDS = 8 * 60 * 60;

type JwtPayload = {
  sessionId: string;
  userId: string;
};

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const token = jwt.sign({ sessionId, userId }, env.JWT_SECRET, {
    expiresIn: SESSION_TTL_SECONDS
  });

  await prisma.authSession.create({
    data: {
      id: sessionId,
      userId,
      sessionTokenHash: sha256Hex(token),
      expiresAt
    }
  });

  return { token, expiresAt };
}

export async function getAuthenticatedUserFromToken(token: string): Promise<AuthenticatedUser> {
  let payload: JwtPayload;

  try {
    payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    throw new AuthorizationError("Authentication session is invalid or expired.");
  }

  const session = await prisma.authSession.findUnique({
    where: { id: payload.sessionId },
    include: {
      user: {
        include: {
          ndiProfile: true
        }
      }
    }
  });

  if (!session || session.expiresAt < new Date()) {
    throw new AuthorizationError("Authentication session is invalid or expired.");
  }

  if (session.sessionTokenHash !== sha256Hex(token)) {
    throw new AuthorizationError("Authentication session token mismatch.");
  }

  const { user } = session;
  const { ndiProfile } = user;

  return {
    userId: user.id,
    profileId: ndiProfile.id,
    holderDID: ndiProfile.holderDID,
    employmentId: ndiProfile.employmentId,
    employeeHash: ndiProfile.employeeHash,
    employer: ndiProfile.employer,
    position: ndiProfile.position,
    employmentType: ndiProfile.employmentType,
    role: user.role,
    permissions: getPermissionsForRole(user.role)
  };
}

export async function logoutToken(token: string): Promise<void> {
  await prisma.authSession.deleteMany({
    where: {
      sessionTokenHash: sha256Hex(token)
    }
  });
}
