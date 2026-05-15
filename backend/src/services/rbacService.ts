import type { Role } from "@prisma/client";
import { rolePermissions, type Permission } from "../types/domain.js";
import { AuthorizationError } from "../utils/errors.js";

export function getPermissionsForRole(role: Role): Permission[] {
  return rolePermissions[role] ?? [];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return getPermissionsForRole(role).includes(permission);
}

export function assertPermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new AuthorizationError(`Role ${role} is missing permission ${permission}.`, {
      role,
      permission
    });
  }
}
