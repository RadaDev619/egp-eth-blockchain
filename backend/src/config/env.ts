import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("postgresql://egp:egp@localhost:5432/egp_trust?schema=public"),
  JWT_SECRET: z.string().min(16),
  EMPLOYEE_HASH_SALT: z.string().min(8),
  NDI_MODE: z.enum(["mock", "staging"]).default("mock"),
  NDI_AUTH_BASE_URL: z.string().url().default("https://staging.bhutanndi.com"),
  NDI_VERIFIER_BASE_URL: z.string().url().default("https://demo-client.bhutanndi.com"),
  NDI_CLIENT_ID: z.string().optional(),
  NDI_CLIENT_SECRET: z.string().optional(),
  BLOCKCHAIN_MODE: z.enum(["mock", "local", "sepolia"]).default("mock"),
  LOCAL_RPC_URL: z.string().default("http://127.0.0.1:8545"),
  SEPOLIA_RPC_URL: z.string().optional(),
  RELAYER_PRIVATE_KEY: z.string().optional(),
  ETHERSCAN_BASE_URL: z.string().default("https://sepolia.etherscan.io/tx/"),
  TX_CONFIRMATIONS: z.coerce.number().int().positive().default(1),
  ROLE_MANAGER_ADDRESS: z.string().optional(),
  TENDER_REGISTRY_ADDRESS: z.string().optional(),
  APPROVAL_MANAGER_ADDRESS: z.string().optional(),
  AUDIT_LOG_ADDRESS: z.string().optional(),
  IPFS_MODE: z.enum(["mock", "pinata"]).default("mock"),
  PINATA_JWT: z.string().optional()
});

export const env = envSchema.parse(process.env);

export function assertSafeRuntimeConfig() {
  if (env.NDI_MODE !== "mock" && (!env.NDI_CLIENT_ID || !env.NDI_CLIENT_SECRET)) {
    throw new Error("NDI_CLIENT_ID and NDI_CLIENT_SECRET are required outside mock NDI mode.");
  }

  const forbiddenRuntimeSecrets = new Set([
    "replace-with-local-development-secret",
    "replace-with-local-development-salt",
    "phase-demo-local-development-secret",
    "phase-demo-local-salt"
  ]);

  if (env.NODE_ENV === "production" && forbiddenRuntimeSecrets.has(env.JWT_SECRET)) {
    throw new Error("JWT_SECRET must be configured with a production secret.");
  }

  if (env.NODE_ENV === "production" && forbiddenRuntimeSecrets.has(env.EMPLOYEE_HASH_SALT)) {
    throw new Error("EMPLOYEE_HASH_SALT must be configured with a production salt.");
  }
}
