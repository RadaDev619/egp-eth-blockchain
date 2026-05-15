import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  proofRequests: new Map<string, Record<string, unknown>>(),
  ndiProfiles: new Map<string, Record<string, unknown>>(),
  users: new Map<string, Record<string, unknown>>(),
  sessions: new Map<string, Record<string, unknown>>(),
  auditLogs: [] as Array<Record<string, unknown>>,
  reset() {
    this.proofRequests.clear();
    this.ndiProfiles.clear();
    this.users.clear();
    this.sessions.clear();
    this.auditLogs.length = 0;
  }
}));

vi.mock("../../src/utils/prisma.js", () => {
  const updateProofRequest = vi.fn(async ({ where, data }) => {
    const existing = db.proofRequests.get(where.threadId);
    const updated = { ...existing, ...data };
    db.proofRequests.set(where.threadId, updated);
    return updated;
  });

  const tx = {
    nDIProfile: {
      upsert: vi.fn(async ({ where, update, create }) => {
        const existing = db.ndiProfiles.get(where.employmentId);
        const record = {
          id: existing?.id ?? `${where.employmentId.toLowerCase()}-profile`,
          ...(existing ? update : create)
        };
        db.ndiProfiles.set(where.employmentId, record);
        return record;
      })
    },
    user: {
      upsert: vi.fn(async ({ where, update, create }) => {
        const existing = db.users.get(where.id);
        const record = {
          id: where.id,
          ...(existing ? update : create)
        };
        db.users.set(where.id, record);
        return record;
      })
    },
    nDIProofRequest: {
      update: updateProofRequest
    }
  };

  return {
    prisma: {
      nDIProofRequest: {
        create: vi.fn(async ({ data }) => {
          const record = { id: `${data.threadId}-id`, ...data };
          db.proofRequests.set(data.threadId, record);
          return record;
        }),
        findUnique: vi.fn(async ({ where }) => db.proofRequests.get(where.threadId) ?? null),
        update: updateProofRequest
      },
      authSession: {
        create: vi.fn(async ({ data }) => {
          db.sessions.set(data.id, data);
          return data;
        }),
        findUnique: vi.fn(async ({ where }) => {
          const session = db.sessions.get(where.id);
          if (!session) {
            return null;
          }

          const user = db.users.get(String(session.userId));
          if (!user) {
            return null;
          }

          const ndiProfile = [...db.ndiProfiles.values()].find((profile) => profile.id === user.ndiProfileId);

          return {
            ...session,
            user: {
              ...user,
              ndiProfile
            }
          };
        }),
        deleteMany: vi.fn(async ({ where }) => {
          for (const [id, session] of db.sessions.entries()) {
            if (session.sessionTokenHash === where.sessionTokenHash) {
              db.sessions.delete(id);
            }
          }

          return { count: 1 };
        })
      },
      auditLog: {
        create: vi.fn(async ({ data }) => {
          const record = {
            id: `audit-${db.auditLogs.length + 1}`,
            createdAt: new Date(),
            ...data
          };
          db.auditLogs.push(record);
          return record;
        }),
        findMany: vi.fn(async () => db.auditLogs)
      },
      $transaction: vi.fn(async (callback) => callback(tx))
    }
  };
});

const { createApp } = await import("../../src/app.js");

type StartPayload = {
  proofRequestThreadId: string;
  proofRequestURL: string;
  deepLinkURL: string;
  requestedAttributes: string[];
};

type AuthPayload = {
  token: string;
  employeeHash: string;
  role: string;
  permissions: string[];
  proof: {
    status: string;
  };
  user: {
    employmentId: string;
    role: string;
    permissions: string[];
  };
};

type MePayload = {
  user: {
    role: string;
    permissions: string[];
  };
};

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

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

describe("mock NDI authentication routes", () => {
  beforeEach(() => {
    db.reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("completes mock NDI login from employment mapping and ignores frontend role", async () => {
    await withServer(async (baseUrl) => {
      const startResponse = await fetch(`${baseUrl}/auth/ndi/start`, { method: "POST" });
      expect(startResponse.status).toBe(200);

      const startPayload = await readJson<StartPayload>(startResponse);
      expect(startPayload.proofRequestThreadId).toMatch(/^mock-thread-/);
      expect(startPayload.proofRequestURL).toContain(startPayload.proofRequestThreadId);
      expect(startPayload.deepLinkURL).toContain(startPayload.proofRequestThreadId);
      expect(startPayload.requestedAttributes).toEqual([
        "Employment ID",
        "Position",
        "Employment Type",
        "Employer"
      ]);
      expect(startPayload.requestedAttributes).not.toContain("Salary");

      const completeResponse = await fetch(`${baseUrl}/auth/ndi/mock-complete`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": "test-request-1" },
        body: JSON.stringify({
          proofRequestThreadId: startPayload.proofRequestThreadId,
          employmentId: "VEND-001",
          role: "FINANCE_OFFICER"
        })
      });

      expect(completeResponse.status).toBe(200);
      const completePayload = await readJson<AuthPayload>(completeResponse);
      expect(completePayload.proof.status).toBe("ProofValidated");
      expect(completePayload.user.employmentId).toBe("VEND-001");
      expect(completePayload.user.role).toBe("VENDOR");
      expect(completePayload.role).toBe("VENDOR");
      expect(completePayload.permissions).toContain("SUBMIT_BID");
      expect(completePayload.permissions).not.toContain("APPROVE_PAYMENT");
      expect(completePayload.employeeHash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(db.sessions.size).toBe(1);
      expect([...db.sessions.values()][0]).toMatchObject({
        userId: "vend-001-user"
      });

      const meResponse = await fetch(`${baseUrl}/auth/me`, {
        headers: { authorization: `Bearer ${completePayload.token}` }
      });

      expect(meResponse.status).toBe(200);
      const mePayload = await readJson<MePayload>(meResponse);
      expect(mePayload.user.role).toBe("VENDOR");
      expect(mePayload.user.permissions).toContain("SUBMIT_BID");
      expect(mePayload.user.permissions).not.toContain("APPROVE_PAYMENT");

      expect(db.auditLogs.map((log) => log.action)).toEqual(["NDI_PROOF_VALIDATED", "ROLE_MAPPED"]);
      expect(db.auditLogs.every((log) => log.actorRole === "VENDOR")).toBe(true);
      expect(db.auditLogs.every((log) => log.requestId === "test-request-1")).toBe(true);
      expect(JSON.stringify(db.auditLogs)).not.toContain("Salary");
    });
  });

  it("keeps the /auth/login compatibility alias backend-owned", async () => {
    await withServer(async (baseUrl) => {
      const loginResponse = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employmentId: "PROC-001",
          role: "AUDITOR"
        })
      });

      expect(loginResponse.status).toBe(200);
      const loginPayload = await readJson<AuthPayload>(loginResponse);
      expect(loginPayload.user.role).toBe("PROCUREMENT_OFFICER");
      expect(loginPayload.permissions).toContain("CREATE_TENDER");
      expect(loginPayload.permissions).not.toContain("VIEW_AUDIT_LOGS");
      expect(db.auditLogs.map((log) => log.action)).toEqual(["NDI_PROOF_VALIDATED", "ROLE_MAPPED"]);
    });
  });
});
