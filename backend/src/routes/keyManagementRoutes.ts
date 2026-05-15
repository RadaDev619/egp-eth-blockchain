import { Router } from "express";
import {
  releaseEnvelopeKeyController,
  requestEnvelopeKeyReleaseController
} from "../controllers/keyManagementController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { permissions } from "../types/domain.js";

export const keyManagementRoutes = Router();

keyManagementRoutes.use(authMiddleware);

keyManagementRoutes.post(
  "/gateway/proposal-envelopes/:proposalEnvelopeId/key-release/request",
  requirePermission(permissions.REQUEST_KEY_RELEASE, "REQUEST_KEY_RELEASE"),
  requestEnvelopeKeyReleaseController
);

keyManagementRoutes.post(
  "/gateway/key-release-requests/:keyReleaseRequestId/release",
  requirePermission(permissions.RELEASE_ENVELOPE_KEY, "RELEASE_ENVELOPE_KEY"),
  releaseEnvelopeKeyController
);
