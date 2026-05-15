import { Router } from "express";
import { getPublicTenderTimeline, getPublicTxProof, listPublicAudit } from "../controllers/publicAuditController.js";

export const publicAuditRoutes = Router();

publicAuditRoutes.get("/public/audit", listPublicAudit);
publicAuditRoutes.get("/public/audit/tenders/:tenderId", getPublicTenderTimeline);
publicAuditRoutes.get("/public/audit/tx/:txHash", getPublicTxProof);
