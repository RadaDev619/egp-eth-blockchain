import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routesDir = path.join(process.cwd(), "src", "routes");
const routeSource = fs
  .readdirSync(routesDir)
  .filter((file) => file.endsWith(".ts"))
  .map((file) => fs.readFileSync(path.join(routesDir, file), "utf8"))
  .join("\n");

describe("secure gateway routes", () => {
  it("registers fixed secure gateway routes without a generic relayer or contract-call endpoint", () => {
    expect(routeSource).toContain("/gateway/policies");
    expect(routeSource).toContain("/gateway/tenders/:tenderId/context");
    expect(routeSource).toContain("/gateway/tenders/:tenderId/policy-check");
    expect(routeSource).not.toMatch(/relayer\/call-contract/i);
    expect(routeSource).not.toMatch(/contract-call/i);
    expect(routeSource).not.toMatch(/callContract/);
  });
});
