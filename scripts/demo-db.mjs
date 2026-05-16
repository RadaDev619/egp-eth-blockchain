import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = resolve(rootDir, "backend");
const mode = process.argv[2];
const env = { ...process.env };

loadDotenv({ path: resolve(backendDir, ".env"), processEnv: env });

const defaultEnv = {
  DATABASE_URL: "postgresql://egp:egp@localhost:5432/egp_trust?schema=public",
  JWT_SECRET: "phase-demo-local-development-secret",
  EMPLOYEE_HASH_SALT: "phase-demo-local-salt",
  NDI_MODE: "mock",
  BLOCKCHAIN_MODE: "mock",
  IPFS_MODE: "mock"
};

for (const [key, value] of Object.entries(defaultEnv)) {
  if (!env[key]) {
    env[key] = value;
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: backendDir,
    env,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(
      "\nDemo database command failed. Ensure PostgreSQL is running and DATABASE_URL points to the demo database."
    );
    process.exit(result.status ?? 1);
  }
}

if (mode === "seed") {
  run("npx", ["tsx", "prisma/seed.ts"]);
} else if (mode === "reset") {
  run("npx", ["prisma", "db", "push", "--force-reset", "--skip-generate"]);
  run("npx", ["tsx", "prisma/seed.ts"]);
} else {
  console.error("Usage: node scripts/demo-db.mjs <seed|reset>");
  process.exit(1);
}
