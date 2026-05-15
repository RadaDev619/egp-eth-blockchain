import type { NextFunction, Request, Response } from "express";
import { getAuthenticatedUserFromToken } from "../services/sessionService.js";
import { AuthorizationError } from "../utils/errors.js";

export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    next(new AuthorizationError("Authentication is required."));
    return;
  }

  try {
    req.user = await getAuthenticatedUserFromToken(token);
    next();
  } catch (error) {
    next(error);
  }
}

export async function optionalAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    next();
    return;
  }

  try {
    req.user = await getAuthenticatedUserFromToken(token);
  } catch {
    req.user = undefined;
  }

  next();
}
