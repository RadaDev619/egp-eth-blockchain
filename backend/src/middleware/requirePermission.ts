import type { NextFunction, Request, Response } from "express";
import { actorAuditFields, logUnauthorizedAttempt } from "../services/auditService.js";
import { hasPermission } from "../services/rbacService.js";
import type { Permission } from "../types/domain.js";
import { AuthorizationError } from "../utils/errors.js";

export function requirePermission(permission: Permission, attemptedAction: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new AuthorizationError("Authentication is required."));
      return;
    }

    if (!hasPermission(req.user.role, permission)) {
      const resourceId = String(req.params.id ?? req.body?.tenderId ?? "");

      await logUnauthorizedAttempt({
        ...actorAuditFields(req.user),
        resourceType: "PROCUREMENT_ACTION",
        resourceId: resourceId || null,
        tenderId: resourceId || null,
        permissionChecked: permission,
        rejectionReason: "PERMISSION_MISSING",
        route: req.originalUrl,
        httpMethod: req.method,
        requestId: req.requestId,
        metadata: {
          attemptedAction,
          role: req.user.role,
          permission
        }
      });

      next(new AuthorizationError(`Role ${req.user.role} is missing permission ${permission}.`));
      return;
    }

    next();
  };
}
