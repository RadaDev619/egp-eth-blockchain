import { Router } from "express";
import { auditRoutes } from "./auditRoutes.js";
import { awardRoutes } from "./awardRoutes.js";
import { authRoutes } from "./authRoutes.js";
import { evaluationCommitteeRoutes } from "./evaluationCommitteeRoutes.js";
import { financialEvaluationRoutes } from "./financialEvaluationRoutes.js";
import { keyManagementRoutes } from "./keyManagementRoutes.js";
import { procurementRoutes } from "./procurementRoutes.js";
import { proposalPackageRoutes } from "./proposalPackageRoutes.js";
import { publicAuditRoutes } from "./publicAuditRoutes.js";
import { secureGatewayRoutes } from "./secureGatewayRoutes.js";
import { tenderAssignmentRoutes } from "./tenderAssignmentRoutes.js";
import { tenderManifestRoutes } from "./tenderManifestRoutes.js";

export const routes = Router();

routes.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "egp-trust-layer-backend",
    phase: "backend-foundation"
  });
});

routes.use(authRoutes);
routes.use(publicAuditRoutes);
routes.use(procurementRoutes);
routes.use(tenderAssignmentRoutes);
routes.use(secureGatewayRoutes);
routes.use(tenderManifestRoutes);
routes.use(proposalPackageRoutes);
routes.use(keyManagementRoutes);
routes.use(evaluationCommitteeRoutes);
routes.use(financialEvaluationRoutes);
routes.use(awardRoutes);
routes.use(auditRoutes);
