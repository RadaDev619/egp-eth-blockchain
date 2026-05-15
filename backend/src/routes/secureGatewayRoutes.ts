import { Router } from "express";
import {
  checkSecureGatewayActionController,
  getSecureGatewayContextController,
  listSecureGatewayPoliciesController
} from "../controllers/secureGatewayController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

export const secureGatewayRoutes = Router();

secureGatewayRoutes.use(authMiddleware);

secureGatewayRoutes.get("/gateway/policies", listSecureGatewayPoliciesController);
secureGatewayRoutes.get("/gateway/tenders/:tenderId/context", getSecureGatewayContextController);
secureGatewayRoutes.post("/gateway/tenders/:tenderId/policy-check", checkSecureGatewayActionController);
