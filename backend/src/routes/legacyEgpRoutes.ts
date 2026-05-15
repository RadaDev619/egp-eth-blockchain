import { Router } from "express";
import {
  getLegacyEgpRecordController,
  ingestLegacyEgpRecordController,
  listLegacyEgpRecordsController
} from "../controllers/legacyEgpController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { permissions } from "../types/domain.js";

export const legacyEgpRoutes = Router();

legacyEgpRoutes.use(authMiddleware);

legacyEgpRoutes.get(
  "/gateway/legacy-egp/records",
  requirePermission(permissions.VIEW_ASSIGNED_TENDERS, "VIEW_LEGACY_EGP_SIMULATOR_RECORDS"),
  listLegacyEgpRecordsController
);

legacyEgpRoutes.get(
  "/gateway/legacy-egp/records/:id",
  requirePermission(permissions.VIEW_ASSIGNED_TENDERS, "VIEW_LEGACY_EGP_SIMULATOR_RECORD"),
  getLegacyEgpRecordController
);

legacyEgpRoutes.post(
  "/gateway/legacy-egp/records",
  requirePermission(permissions.MANAGE_LEGACY_EGP_SIMULATOR, "INGEST_LEGACY_EGP_SIMULATOR_RECORD"),
  ingestLegacyEgpRecordController
);
