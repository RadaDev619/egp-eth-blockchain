import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../../src/types/domain.js";

const users = vi.hoisted(() => ({
  auditor: {
    userId: "aud-user",
    profileId: "aud-profile",
    holderDID: "did:key:mock-auditor",
    employmentId: "AUD-001",
    employeeHash: "0xauditor",
    employer: "Royal Audit Authority",
    position: "Auditor",
    employmentType: "Regular",
    role: "AUDITOR",
    permissions: ["VIEW_AUDIT_LOGS"]
  },
  vendor: {
    userId: "vendor-user",
    profileId: "vendor-profile",
    holderDID: "did:key:mock-vendor",
    employmentId: "VEND-001",
    employeeHash: "0xvendor",
    employer: "Demo Vendor Pvt Ltd",
    position: "Vendor Representative",
    employmentType: "Contract",
    role: "VENDOR",
    permissions: ["SUBMIT_BID"]
  }
}) satisfies Record<string, AuthenticatedUser>);

const db = vi.hoisted(() => ({
  auditLogs: [] as Array<Record<string, unknown>>,
  blockchainTransactions: [] as Array<Record<string, unknown>>,
  tenders: [] as Array<Record<string, unknown>>,
  versions: [] as Array<Record<string, unknown>>,
  bids: [] as Array<Record<string, unknown>>,
  approvals: [] as Array<Record<string, unknown>>,
  transitions: [] as Array<Record<string, unknown>>,
  reset() {
    const tenderId = "tender-1";
    this.auditLogs.length = 0;
    this.blockchainTransactions.length = 0;
    this.tenders.length = 0;
    this.versions.length = 0;
    this.bids.length = 0;
    this.approvals.length = 0;
    this.transitions.length = 0;

    this.tenders.push({
      id: tenderId,
      tenderCode: "TDR-001",
      agency: "Ministry of Finance",
      currentState: "PAYMENT_APPROVED",
      currentVersion: 1,
      createdByEmployeeHash: "0xproc",
      createdByRole: "PROCUREMENT_OFFICER",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:03:00.000Z")
    });
    this.versions.push({
      id: "version-1",
      tenderId,
      versionNumber: 1,
      title: "Bridge Works",
      documentHash: "0xdoc",
      createdAt: new Date("2026-01-01T00:00:00.000Z")
    });
    this.bids.push({
      id: "bid-1",
      tenderId,
      bidHash: "0xbid",
      vendorEmployeeHash: "0xvendor",
      vendorRole: "VENDOR",
      createdAt: new Date("2026-01-01T00:01:00.000Z")
    });
    this.approvals.push({
      id: "approval-1",
      tenderId,
      approvalType: "PAYMENT",
      actorEmployeeHash: "0xfin",
      actorRole: "FINANCE_OFFICER",
      previousState: "EVALUATION_APPROVED",
      newState: "PAYMENT_APPROVED",
      createdAt: new Date("2026-01-01T00:03:00.000Z")
    });
    this.transitions.push({
      id: "transition-1",
      tenderId,
      action: "APPROVE_PAYMENT",
      actorEmployeeHash: "0xfin",
      actorRole: "FINANCE_OFFICER",
      fromState: "EVALUATION_APPROVED",
      toState: "PAYMENT_APPROVED",
      allowed: true,
      createdAt: new Date("2026-01-01T00:03:00.000Z")
    });
    this.blockchainTransactions.push({
      id: "chain-1",
      txHash: "0xmockpay",
      network: "mock",
      chainId: 31337,
      action: "PAYMENT_APPROVED",
      resourceType: "APPROVAL",
      resourceId: "approval-1",
      tenderId,
      status: "MOCK_CONFIRMED",
      blockNumber: 0,
      explorerUrl: null,
      createdAt: new Date("2026-01-01T00:03:01.000Z")
    });
    this.auditLogs.push(
      {
        id: "audit-2",
        tenderId,
        action: "UNAUTHORIZED_ACTION_ATTEMPTED",
        status: "BLOCKED",
        actorRole: "VENDOR",
        actorEmployeeHash: "0xvendor",
        fromState: "EVALUATION_APPROVED",
        toState: null,
        rejectionReason: "PERMISSION_MISSING",
        txHash: null,
        createdAt: new Date("2026-01-01T00:02:00.000Z")
      },
      {
        id: "audit-1",
        tenderId,
        action: "TENDER_CREATED",
        status: "MOCK_CHAIN_CONFIRMED",
        actorRole: "PROCUREMENT_OFFICER",
        actorEmployeeHash: "0xproc",
        fromState: null,
        toState: "CREATED",
        rejectionReason: null,
        txHash: "0xmockcreate",
        blockchainStatus: "MOCK_CONFIRMED",
        createdAt: new Date("2026-01-01T00:00:00.000Z")
      },
      {
        id: "audit-3",
        tenderId,
        action: "PAYMENT_APPROVED",
        status: "MOCK_CHAIN_CONFIRMED",
        actorRole: "FINANCE_OFFICER",
        actorEmployeeHash: "0xfin",
        fromState: "EVALUATION_APPROVED",
        toState: "PAYMENT_APPROVED",
        rejectionReason: null,
        txHash: "0xmockpay",
        blockchainStatus: "MOCK_CONFIRMED",
        createdAt: new Date("2026-01-01T00:03:00.000Z")
      }
    );
  }
}));

function sortCreatedAtAsc(items: Array<Record<string, unknown>>) {
  return [...items].sort(
    (a, b) => Number((a.createdAt as Date).getTime()) - Number((b.createdAt as Date).getTime())
  );
}

function applyWhere(items: Array<Record<string, unknown>>, where: Record<string, unknown>) {
  return items.filter((item) =>
    Object.entries(where).every(([key, value]) => {
      if (value === undefined) {
        return true;
      }

      if (key === "createdAt") {
        return true;
      }

      return item[key] === value;
    })
  );
}

vi.mock("../../src/services/sessionService.js", () => ({
  createSession: vi.fn(),
  logoutToken: vi.fn(),
  getAuthenticatedUserFromToken: vi.fn(async (token: string) => {
    const user = users[token as keyof typeof users];
    if (!user) {
      throw new Error("Invalid test token.");
    }

    return user;
  })
}));

vi.mock("../../src/utils/prisma.js", () => ({
  prisma: {
    auditLog: {
      findMany: vi.fn(async ({ where = {} }) => sortCreatedAtAsc(applyWhere(db.auditLogs, where))),
      create: vi.fn(async ({ data }) => {
        const audit = {
          id: `audit-${db.auditLogs.length + 1}`,
          createdAt: new Date(),
          ...data
        };
        db.auditLogs.push(audit);
        return audit;
      })
    },
    tender: {
      findUnique: vi.fn(async ({ where }) => {
        const tender = db.tenders.find((candidate) => candidate.id === where.id);
        if (!tender) {
          return null;
        }

        return {
          ...tender,
          versions: sortCreatedAtAsc(db.versions.filter((version) => version.tenderId === tender.id)),
          bids: sortCreatedAtAsc(db.bids.filter((bid) => bid.tenderId === tender.id)),
          approvals: sortCreatedAtAsc(db.approvals.filter((approval) => approval.tenderId === tender.id)),
          transitions: sortCreatedAtAsc(db.transitions.filter((transition) => transition.tenderId === tender.id))
        };
      })
    },
    blockchainTransaction: {
      findMany: vi.fn(async ({ where = {} }) => sortCreatedAtAsc(applyWhere(db.blockchainTransactions, where))),
      findUnique: vi.fn(async ({ where }) =>
        db.blockchainTransactions.find((transaction) => transaction.txHash === where.txHash) ?? null
      )
    }
  }
}));

const { createApp } = await import("../../src/app.js");

async function withServer<T>(callback: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = createApp();
  const server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });

  try {
    const address = server.address() as AddressInfo;
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function auth(token: keyof typeof users) {
  return { authorization: `Bearer ${token}` };
}

describe("audit timeline routes", () => {
  beforeEach(() => {
    db.reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns chronological audit logs with blocked and successful events for auditors", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/audit/logs`, {
        headers: auth("auditor")
      });

      expect(response.status).toBe(200);
      const payload = await readJson<{ timeline: Array<Record<string, unknown>> }>(response);

      expect(payload.timeline.map((event) => event.action)).toEqual([
        "TENDER_CREATED",
        "UNAUTHORIZED_ACTION_ATTEMPTED",
        "PAYMENT_APPROVED"
      ]);
      expect(payload.timeline[1]).toMatchObject({
        status: "BLOCKED",
        actorRole: "VENDOR",
        employeeHash: "0xvendor",
        rejectionReason: "PERMISSION_MISSING"
      });
      expect(payload.timeline[2]).toMatchObject({
        status: "MOCK_CHAIN_CONFIRMED",
        actorRole: "FINANCE_OFFICER",
        employeeHash: "0xfin",
        fromState: "EVALUATION_APPROVED",
        toState: "PAYMENT_APPROVED",
        txHash: "0xmockpay"
      });
    });
  });

  it("returns tender timeline with tender history and blockchain proof data", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/audit/tender/tender-1/timeline`, {
        headers: auth("auditor")
      });

      expect(response.status).toBe(200);
      const payload = await readJson<{
        tender: Record<string, unknown>;
        versions: unknown[];
        bids: unknown[];
        approvals: unknown[];
        transitions: unknown[];
        blockchainTransactions: Array<Record<string, unknown>>;
        timeline: Array<Record<string, unknown>>;
      }>(response);

      expect(payload.tender.id).toBe("tender-1");
      expect(payload.versions).toHaveLength(1);
      expect(payload.bids).toHaveLength(1);
      expect(payload.approvals).toHaveLength(1);
      expect(payload.transitions).toHaveLength(1);
      expect(payload.blockchainTransactions[0]).toMatchObject({
        txHash: "0xmockpay",
        status: "MOCK_CONFIRMED"
      });
      expect(payload.timeline.map((event) => event.action)).toContain("UNAUTHORIZED_ACTION_ATTEMPTED");
      expect(payload.timeline.map((event) => event.action)).toContain("PAYMENT_APPROVED");
    });
  });

  it("returns audit proof by tx hash", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/audit/tx/0xmockpay`, {
        headers: auth("auditor")
      });

      expect(response.status).toBe(200);
      const payload = await readJson<{
        txHash: string;
        blockchainTransaction: Record<string, unknown>;
        timeline: Array<Record<string, unknown>>;
      }>(response);

      expect(payload.txHash).toBe("0xmockpay");
      expect(payload.blockchainTransaction).toMatchObject({
        action: "PAYMENT_APPROVED",
        status: "MOCK_CONFIRMED"
      });
      expect(payload.timeline).toHaveLength(1);
      expect(payload.timeline[0]).toMatchObject({
        action: "PAYMENT_APPROVED",
        txHash: "0xmockpay"
      });
    });
  });

  it("blocks non-auditors from global audit logs", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/audit/logs`, {
        headers: auth("vendor")
      });

      expect(response.status).toBe(403);
      expect(db.auditLogs.at(-1)).toMatchObject({
        action: "UNAUTHORIZED_ACTION_ATTEMPTED",
        status: "BLOCKED",
        actorRole: "VENDOR",
        permissionChecked: "VIEW_AUDIT_LOGS"
      });
    });
  });
});
