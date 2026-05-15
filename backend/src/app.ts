import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { routes } from "./routes/index.js";

function allowedFrontendOrigins() {
  return new Set([
    env.FRONTEND_ORIGIN,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001"
  ]);
}

function isAllowedDevelopmentOrigin(origin: string) {
  if (env.NODE_ENV !== "development") {
    return false;
  }

  try {
    const { hostname, port, protocol } = new URL(origin);
    const isPrivateIpv4 =
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname);

    return protocol === "http:" && (port === "3000" || port === "3001") && isPrivateIpv4;
  } catch {
    return false;
  }
}

export function createApp() {
  const app = express();
  const frontendOrigins = allowedFrontendOrigins();

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || frontendOrigins.has(origin) || isAllowedDevelopmentOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`CORS origin not allowed: ${origin}`));
      },
      credentials: true
    })
  );
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestIdMiddleware);
  app.use(routes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
