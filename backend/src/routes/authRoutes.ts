import { Router } from "express";
import {
  completeMockNdi,
  getPermissions,
  getSession,
  listDemoProfiles,
  login,
  logout,
  startNdi
} from "../controllers/authController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

export const authRoutes = Router();

authRoutes.get("/auth/demo-profiles", listDemoProfiles);
authRoutes.post("/auth/login", login);
authRoutes.post("/auth/ndi/start", startNdi);
authRoutes.post("/auth/ndi/mock-complete", completeMockNdi);
authRoutes.get("/auth/session", authMiddleware, getSession);
authRoutes.get("/auth/me", authMiddleware, getSession);
authRoutes.get("/auth/permissions", authMiddleware, getPermissions);
authRoutes.post("/auth/logout", authMiddleware, logout);
