import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import {
  amendTenderController,
  approveEvaluationController,
  approvePaymentController,
  createTenderController,
  getTenderController,
  ingestEgpEventController,
  listTendersController,
  submitBidController,
  verifyDocumentController
} from "../controllers/procurementController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { permissions } from "../types/domain.js";
import { ValidationError } from "../utils/errors.js";
import { MAX_PDF_UPLOAD_BYTES, sanitizeFilename } from "../utils/hashDocument.js";

export const procurementRoutes = Router();

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PDF_UPLOAD_BYTES,
    files: 1
  },
  fileFilter: (_req, file, callback) => {
    const sanitizedFilename = sanitizeFilename(file.originalname);
    const isPdf = file.mimetype === "application/pdf" && sanitizedFilename.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      callback(new ValidationError("Only PDF documents are accepted.", { field: "document" }));
      return;
    }

    callback(null, true);
  }
});

function pdfDocumentUpload(req: Request, res: Response, next: NextFunction) {
  pdfUpload.single("document")(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      next(
        new ValidationError("Uploaded PDF document is invalid.", {
          field: "document",
          code: error.code,
          maxBytes: MAX_PDF_UPLOAD_BYTES
        })
      );
      return;
    }

    next(error);
  });
}

procurementRoutes.use(authMiddleware);

procurementRoutes.post(
  "/tender/create",
  requirePermission(permissions.CREATE_TENDER, "CREATE_TENDER"),
  pdfDocumentUpload,
  createTenderController
);
procurementRoutes.post(
  "/tender/amend",
  requirePermission(permissions.CREATE_TENDER_VERSION, "CREATE_TENDER_VERSION"),
  pdfDocumentUpload,
  amendTenderController
);
procurementRoutes.get("/tenders", listTendersController);
procurementRoutes.get("/tenders/:id", getTenderController);
procurementRoutes.post("/bid/submit", requirePermission(permissions.SUBMIT_BID, "SUBMIT_BID"), submitBidController);
procurementRoutes.post(
  "/approve/evaluation",
  requirePermission(permissions.APPROVE_EVALUATION, "APPROVE_EVALUATION"),
  approveEvaluationController
);
procurementRoutes.post(
  "/approve/payment",
  requirePermission(permissions.APPROVE_PAYMENT, "APPROVE_PAYMENT"),
  approvePaymentController
);
procurementRoutes.post(
  "/verify/document",
  requirePermission(permissions.VERIFY_DOCUMENT, "VERIFY_DOCUMENT"),
  pdfDocumentUpload,
  verifyDocumentController
);
procurementRoutes.post("/egp/event", requirePermission(permissions.CREATE_TENDER, "INGEST_EGP_EVENT"), ingestEgpEventController);
