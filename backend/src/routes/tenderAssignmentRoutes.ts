import { Router } from "express";
import {
  assignTenderRoleController,
  listTenderAssignmentsController,
  revokeTenderRoleController
} from "../controllers/tenderAssignmentController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { permissions } from "../types/domain.js";

export const tenderAssignmentRoutes = Router();

tenderAssignmentRoutes.use(authMiddleware);

tenderAssignmentRoutes.get(
  "/tenders/:tenderId/assignments",
  requirePermission(permissions.VIEW_ASSIGNED_TENDERS, "VIEW_TENDER_ASSIGNMENTS"),
  listTenderAssignmentsController
);

tenderAssignmentRoutes.post(
  "/tenders/:tenderId/assignments",
  requirePermission(permissions.MANAGE_TENDER_ASSIGNMENTS, "MANAGE_TENDER_ASSIGNMENTS"),
  assignTenderRoleController
);

tenderAssignmentRoutes.post(
  "/tenders/:tenderId/assignments/:assignmentId/revoke",
  requirePermission(permissions.MANAGE_TENDER_ASSIGNMENTS, "MANAGE_TENDER_ASSIGNMENTS"),
  revokeTenderRoleController
);
