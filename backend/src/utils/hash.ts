import { createHash } from "node:crypto";

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, Object.keys((value as Record<string, unknown>) ?? {}).sort());
}
