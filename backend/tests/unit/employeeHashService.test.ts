import { describe, expect, it } from "vitest";
import { createEmployeeHash } from "../../src/services/employeeHashService.js";
import { sha256Hex } from "../../src/utils/hash.js";

describe("employeeHashService", () => {
  it("creates a deterministic salted hash and does not expose the raw Employment ID", () => {
    const first = createEmployeeHash("PROC-001");
    const second = createEmployeeHash("PROC-001");

    expect(first).toBe(second);
    expect(first).toMatch(/^0x[a-f0-9]{64}$/);
    expect(first).toBe(`0x${sha256Hex("PROC-001test-local-salt")}`);
    expect(first).not.toBe(`0x${sha256Hex("PROC-001")}`);
    expect(first).not.toContain("PROC-001");
  });
});
