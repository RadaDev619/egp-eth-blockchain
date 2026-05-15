import type { Role } from "@prisma/client";
import { demoProfiles, type DemoNdiProfile } from "../config/demoProfiles.js";
import { AuthorizationError } from "../utils/errors.js";

export type EmploymentAttributes = Pick<
  DemoNdiProfile,
  "employmentId" | "holderDID" | "employer" | "position" | "employmentType"
>;

export function getDemoProfileByEmploymentId(employmentId: string): DemoNdiProfile {
  const profile = demoProfiles.find((candidate) => candidate.employmentId === employmentId);

  if (!profile) {
    throw new AuthorizationError("Unknown mock NDI employment profile.");
  }

  return profile;
}

export function mapEmploymentToRole(attributes: EmploymentAttributes): Role {
  const profile = demoProfiles.find(
    (candidate) =>
      candidate.employmentId === attributes.employmentId &&
      candidate.employer === attributes.employer &&
      candidate.position === attributes.position &&
      candidate.employmentType === attributes.employmentType
  );

  if (!profile) {
    throw new AuthorizationError("Employment credential does not map to an authorized procurement role.", {
      employer: attributes.employer,
      position: attributes.position,
      employmentType: attributes.employmentType
    });
  }

  return profile.role;
}
