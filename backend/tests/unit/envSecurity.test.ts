import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const envSource = fs.readFileSync(path.join(process.cwd(), "src", "config", "env.ts"), "utf8");

describe("environment security", () => {
  it("does not provide runtime fallback secrets for JWT signing or employee hashing", () => {
    expect(envSource).toContain("JWT_SECRET: z.string().min(16)");
    expect(envSource).toContain("EMPLOYEE_HASH_SALT: z.string().min(8)");
    expect(envSource).not.toMatch(/JWT_SECRET:\s*z\.string\(\)\.min\(16\)\.default\(/);
    expect(envSource).not.toMatch(/EMPLOYEE_HASH_SALT:\s*z\.string\(\)\.min\(8\)\.default\(/);
    expect(envSource).not.toContain("phase-two-local-development-secret");
    expect(envSource).not.toContain("phase-two-local-salt");
  });
});
