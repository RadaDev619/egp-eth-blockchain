import { Router } from "express";
import { getTenderTimeline, getTxAuditProof, listAuditLogs } from "../controllers/auditController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { permissions } from "../types/domain.js";

export const auditRoutes = Router();

auditRoutes.get(
  "/audit/logs",
  authMiddleware,
  requirePermission(permissions.VIEW_AUDIT_LOGS, "VIEW_AUDIT_LOGS"),
  listAuditLogs
);

auditRoutes.get(
  "/audit/tender/:tenderId/timeline",
  authMiddleware,
  requirePermission(permissions.VIEW_AUDIT_LOGS, "VIEW_AUDIT_LOGS"),
  getTenderTimeline
);

auditRoutes.get(
  "/audit/tx/:txHash",
  authMiddleware,
  requirePermission(permissions.VIEW_AUDIT_LOGS, "VIEW_AUDIT_LOGS"),
  getTxAuditProof
);
