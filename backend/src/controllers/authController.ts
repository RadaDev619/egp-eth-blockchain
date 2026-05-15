import type { Request, Response } from "express";
import { z } from "zod";
import { publicDemoProfiles } from "../config/demoProfiles.js";
import { completeMockNdiLogin, startNdiLogin } from "../services/ndiVerifierService.js";
import { logoutToken } from "../services/sessionService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ValidationError } from "../utils/errors.js";

const mockCompleteSchema = z.object({
  threadId: z.string().min(1).optional(),
  proofRequestThreadId: z.string().min(1).optional(),
  employmentId: z.string().min(1)
});

function resolveThreadId(payload: z.infer<typeof mockCompleteSchema>) {
  const threadId = payload.threadId ?? payload.proofRequestThreadId;

  if (!threadId) {
    throw new ValidationError("proofRequestThreadId is required.");
  }

  return threadId;
}

function requestAuditContext(req: Request) {
  return {
    route: req.originalUrl,
    httpMethod: req.method,
    requestId: req.requestId
  };
}

function authResponse(result: Awaited<ReturnType<typeof completeMockNdiLogin>>) {
  return {
    token: result.session.token,
    expiresAt: result.session.expiresAt,
    proof: result.proof,
    user: result.user,
    role: result.user.role,
    permissions: result.user.permissions,
    employeeHash: result.user.employeeHash
  };
}

export const listDemoProfiles = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ profiles: publicDemoProfiles() });
});

export const startNdi = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await startNdiLogin());
});

export const completeMockNdi = asyncHandler(async (req: Request, res: Response) => {
  const payload = mockCompleteSchema.parse(req.body);
  const result = await completeMockNdiLogin(resolveThreadId(payload), payload.employmentId, requestAuditContext(req));

  res.json(authResponse(result));
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const payload = mockCompleteSchema.parse(req.body);
  const threadId = payload.threadId ?? payload.proofRequestThreadId ?? (await startNdiLogin()).proofRequestThreadId;
  const result = await completeMockNdiLogin(threadId, payload.employmentId, requestAuditContext(req));

  res.json(authResponse(result));
});

export const getSession = asyncHandler(async (req: Request, res: Response) => {
  res.json({ user: req.user });
});

export const getPermissions = asyncHandler(async (req: Request, res: Response) => {
  res.json({
    role: req.user?.role,
    permissions: req.user?.permissions ?? []
  });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (token) {
    await logoutToken(token);
  }

  res.status(204).send();
});
