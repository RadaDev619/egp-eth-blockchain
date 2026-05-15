import type { Request, Response } from "express";
import { z } from "zod";
import {
  amendTender,
  approveEvaluation,
  approvePayment,
  createTender,
  getTender,
  ingestEgpEvent,
  listTenders,
  submitBid
} from "../services/procurementService.js";
import { verifyDocument } from "../services/documentVerificationService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validateAndHashPdfDocument, type HashedPdfDocument } from "../utils/hashDocument.js";
import { ValidationError } from "../utils/errors.js";

const documentHashSchema = z.string().min(8);

const createTenderSchema = z.object({
  tenderCode: z.string().min(3),
  agency: z.string().min(2),
  title: z.string().min(3),
  description: z.string().min(3),
  documentHash: documentHashSchema.optional(),
  ipfsCid: z.string().min(1).optional()
});

const amendTenderSchema = z.object({
  tenderId: z.string().min(1),
  title: z.string().min(3),
  description: z.string().min(3),
  documentHash: documentHashSchema.optional(),
  ipfsCid: z.string().min(1).optional(),
  changeReason: z.string().min(3)
});

const bidSubmitSchema = z.object({
  tenderId: z.string().min(1),
  bidHash: documentHashSchema,
  bidDocumentHash: documentHashSchema.optional(),
  ipfsCid: z.string().min(1).optional()
});

const approvalSchema = z.object({
  tenderId: z.string().min(1),
  comments: z.string().max(1000).optional()
});

const verifyDocumentSchema = z.object({
  tenderId: z.string().min(1),
  versionNumber: z.coerce.number().int().positive().optional(),
  tenderVersionId: z.string().min(1).optional()
});

const egpEventSchema = z.discriminatedUnion("eventType", [
  z.object({
    eventType: z.literal("TENDER_CREATED"),
    payload: createTenderSchema.extend({
      documentHash: documentHashSchema
    })
  }),
  z.object({
    eventType: z.literal("TENDER_AMENDED"),
    payload: amendTenderSchema.extend({
      documentHash: documentHashSchema
    })
  })
]);

function requireUser(req: Request) {
  if (!req.user) {
    throw new ValidationError("Authenticated user context is required.");
  }

  return req.user;
}

function requestContext(req: Request) {
  return {
    route: req.originalUrl,
    httpMethod: req.method,
    requestId: req.requestId
  };
}

function uploadedPdf(req: Request): HashedPdfDocument | null {
  return req.file ? validateAndHashPdfDocument(req.file) : null;
}

function requireDocumentHashOrUpload<T extends { documentHash?: string; ipfsCid?: string }>(
  payload: T,
  document: HashedPdfDocument | null
) {
  if (!payload.documentHash && !document) {
    throw new ValidationError("A PDF document upload or documentHash is required.", {
      field: "document"
    });
  }

  return {
    ...payload,
    documentHash: document?.documentHash ?? payload.documentHash ?? "",
    ipfsCid: document ? undefined : payload.ipfsCid,
    uploadedDocument: document
  };
}

export const createTenderController = asyncHandler(async (req: Request, res: Response) => {
  const payload = createTenderSchema.parse(req.body);
  const tender = await createTender(requireDocumentHashOrUpload(payload, uploadedPdf(req)), requireUser(req), requestContext(req));

  res.status(201).json({ tender });
});

export const amendTenderController = asyncHandler(async (req: Request, res: Response) => {
  const payload = amendTenderSchema.parse(req.body);
  const tender = await amendTender(requireDocumentHashOrUpload(payload, uploadedPdf(req)), requireUser(req), requestContext(req));

  res.json({ tender });
});

export const listTendersController = asyncHandler(async (_req: Request, res: Response) => {
  const tenders = await listTenders();

  res.json({ tenders });
});

export const getTenderController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.id);
  const tender = await getTender(tenderId);

  res.json({ tender });
});

export const submitBidController = asyncHandler(async (req: Request, res: Response) => {
  const payload = bidSubmitSchema.parse(req.body);
  const tender = await submitBid(payload, requireUser(req), requestContext(req));

  res.status(201).json({ tender });
});

export const approveEvaluationController = asyncHandler(async (req: Request, res: Response) => {
  const payload = approvalSchema.parse(req.body);
  const tender = await approveEvaluation(payload, requireUser(req), requestContext(req));

  res.json({ tender });
});

export const approvePaymentController = asyncHandler(async (req: Request, res: Response) => {
  const payload = approvalSchema.parse(req.body);
  const tender = await approvePayment(payload, requireUser(req), requestContext(req));

  res.json({ tender });
});

export const verifyDocumentController = asyncHandler(async (req: Request, res: Response) => {
  const payload = verifyDocumentSchema.parse(req.body);
  const result = await verifyDocument(
    {
      ...payload,
      uploadedDocument: validateAndHashPdfDocument(req.file)
    },
    requireUser(req),
    requestContext(req)
  );

  res.json(result);
});

export const ingestEgpEventController = asyncHandler(async (req: Request, res: Response) => {
  const payload = egpEventSchema.parse(req.body);
  const tender = await ingestEgpEvent(payload, requireUser(req), requestContext(req));

  res.status(202).json({ accepted: true, tender });
});
