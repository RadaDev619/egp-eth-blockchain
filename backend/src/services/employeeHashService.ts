import { env } from "../config/env.js";
import { ValidationError } from "../utils/errors.js";
import { sha256Hex } from "../utils/hash.js";

export function createEmployeeHash(employmentId: string): string {
  const normalized = employmentId.trim();

  if (!normalized) {
    throw new ValidationError("Employment ID is required.");
  }

  if (!env.EMPLOYEE_HASH_SALT) {
    throw new ValidationError("EMPLOYEE_HASH_SALT is required.");
  }

  return `0x${sha256Hex(`${normalized}${env.EMPLOYEE_HASH_SALT}`)}`;
}
