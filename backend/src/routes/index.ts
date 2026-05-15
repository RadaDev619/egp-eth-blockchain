import { Router } from "express";
import { auditRoutes } from "./auditRoutes.js";
import { authRoutes } from "./authRoutes.js";
import { procurementRoutes } from "./procurementRoutes.js";

export const routes = Router();

routes.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "egp-trust-layer-backend",
    phase: "backend-foundation"
  });
});

routes.use(authRoutes);
routes.use(procurementRoutes);
routes.use(auditRoutes);
