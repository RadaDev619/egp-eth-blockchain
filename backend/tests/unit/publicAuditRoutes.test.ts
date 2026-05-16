import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  tenders: [] as Array<Record<string, any>>,
  proofs: [] as Array<Record<string, any>>,
  auditLogs: [] as Array<Record<string, any>>,
  transactions: [] as Array<Record<string, any>>,
  reset() {
    const tender = {
      id: "tender-1",
      tenderCode: "TDR-PUBLIC-001",
      agency: "Ministry of Finance",
      currentState: "AWARD_APPROVED",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:05:00.000Z")
    };

    this.tenders.length = 0;
    this.proofs.length = 0;
    this.auditLogs.length = 0;
    this.transactions.length = 0;
    this.tenders.push(tender);
    this.proofs.push(
      {
        id: "public-proof-1",
        tenderId: tender.id,
        proofType: "TENDER_MANIFEST",
        proofHash: "0xmanifest",
        sourceTxHash: "0xmockmanifest",
        blockchainStatus: "MOCK_CONFIRMED",
        publicLabel: "Tender manifest committed",
        metadata: { internalNote: "not public" },
        createdAt: new Date("2026-01-01T00:01:00.000Z")
      },
      {
        id: "public-proof-2",
        tenderId: tender.id,
        proofType: "AWARD_APPROVAL",
        proofHash: "0xaward",
        sourceTxHash: "0xmockaward",
        blockchainStatus: "MOCK_CONFIRMED",
        publicLabel: "Award threshold approval met",
        metadata: { approverEmployeeHash: "0xapprover" },
        createdAt: new Date("2026-01-01T00:04:00.000Z")
      }
    );
    this.auditLogs.push({
      id: "audit-1",
      tenderId: tender.id,
      action: "AWARD_APPROVAL_THRESHOLD_MET",
      status: "MOCK_CHAIN_CONFIRMED",
      actorRole: "APPROVING_OFFICER",
      actorEmployeeHash: "0xapprover",
      actorHolderDID: "did:key:approver",
      actorEmployer: "Ministry of Finance",
      actorPosition: "Approving Officer",
      fromState: "AWARD_RECOMMENDED",
      toState: "AWARD_APPROVED",
      documentHash: "0xaward",
      metadataHash: "0xmetadata",
      metadata: { privateField: "hidden" },
      txHash: "0xmockaward",
      blockchainStatus: "MOCK_CONFIRMED",
      route: "/gateway/tenders/tender-1/award",
      requestId: "request-private",
      createdAt: new Date("2026-01-01T00:04:00.000Z")
    });
    this.transactions.push({
      id: "chain-1",
      txHash: "0xmockaward",
      network: "mock",
      chainId: 31337,
      action: "AWARD_APPROVED",
      resourceType: "AWARD_APPROVAL",
      resourceId: "approval-private",
      tenderId: tender.id,
      contractAddress: "mock-contract",
      relayerAddress: "mock-relayer",
      status: "MOCK_CONFIRMED",
      blockNumber: 0,
      explorerUrl: null,
      createdAt: new Date("2026-01-01T00:04:01.000Z"),
      confirmedAt: new Date("2026-01-01T00:04:01.000Z")
    });
  }
}));

function sortCreatedAtAsc(items: Array<Record<string, any>>) {
  return [...items].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

function matchWhere(item: Record<string, any>, where: Record<string, any>) {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) {
      return true;
    }

    if (key === "publicAuditProofs") {
      return db.proofs.some((proof) => proof.tenderId === item.id);
    }

    return item[key] === value;
  });
}

vi.mock("../../src/utils/prisma.js", () => ({
  prisma: {
    publicAuditProof: {
      findMany: vi.fn(async ({ where = {}, include }: { where?: Record<string, any>; include?: unknown }) =>
        sortCreatedAtAsc(db.proofs.filter((proof) => matchWhere(proof, where))).map((proof) =>
          include
            ? {
                ...proof,
                tender: db.tenders.find((tender) => tender.id === proof.tenderId) ?? null
              }
            : proof
        )
      )
    },
    tender: {
      findMany: vi.fn(async ({ where = {} }: { where?: Record<string, any> }) =>
        db.tenders.filter((tender) => matchWhere(tender, where)).map((tender) => ({
          ...tender,
          _count: {
            publicAuditProofs: db.proofs.filter((proof) => proof.tenderId === tender.id).length
          }
        }))
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.tenders.find((tender) => tender.id === where.id) ?? null)
    },
    auditLog: {
      findMany: vi.fn(async ({ where = {} }: { where?: Record<string, any> }) =>
        sortCreatedAtAsc(db.auditLogs.filter((event) => matchWhere(event, where)))
      )
    },
    blockchainTransaction: {
      findMany: vi.fn(async ({ where = {} }: { where?: Record<string, any> }) =>
        sortCreatedAtAsc(db.transactions.filter((transaction) => matchWhere(transaction, where)))
      ),
      findUnique: vi.fn(async ({ where }: { where: { txHash: string } }) =>
        db.transactions.find((transaction) => transaction.txHash === where.txHash) ?? null
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

describe("public audit routes", () => {
  beforeEach(() => {
    db.reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns public proof overview without authentication", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/public/audit`);

      expect(response.status).toBe(200);
      const payload = await readJson<{
        tenders: Array<Record<string, unknown>>;
        proofs: Array<Record<string, unknown>>;
        timeline: Array<Record<string, unknown>>;
      }>(response);

      expect(payload.tenders[0]).toMatchObject({
        tenderCode: "TDR-PUBLIC-001",
        proofCount: 2
      });
      expect(payload.proofs.map((proof) => proof.proofType)).toEqual(["TENDER_MANIFEST", "AWARD_APPROVAL"]);
      expect(JSON.stringify(payload)).not.toContain("0xapprover");
      expect(JSON.stringify(payload)).not.toContain("did:key");
      expect(JSON.stringify(payload)).not.toContain("request-private");
      expect(JSON.stringify(payload)).not.toContain("internalNote");
      expect(JSON.stringify(payload)).not.toContain("keyMaterialReference");
      expect(JSON.stringify(payload)).not.toContain("encryptedFileReference");
      expect(JSON.stringify(payload)).not.toContain("proposalContent");
    });
  });

  it("returns a privacy-safe tender proof timeline", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/public/audit/tenders/tender-1`);

      expect(response.status).toBe(200);
      const payload = await readJson<{
        tender: Record<string, unknown>;
        blockchainTransactions: Array<Record<string, unknown>>;
        timeline: Array<Record<string, unknown>>;
      }>(response);

      expect(payload.tender.tenderCode).toBe("TDR-PUBLIC-001");
      expect(payload.blockchainTransactions[0]).toMatchObject({
        txHash: "0xmockaward",
        status: "MOCK_CONFIRMED"
      });
      expect(payload.timeline).toContainEqual(
        expect.objectContaining({
          action: "AWARD_APPROVAL_THRESHOLD_MET",
          actorRole: "APPROVING_OFFICER",
          txHash: "0xmockaward"
        })
      );
      expect(JSON.stringify(payload)).not.toContain("actorEmployeeHash");
      expect(JSON.stringify(payload)).not.toContain("route");
      expect(JSON.stringify(payload)).not.toContain("approval-private");
      expect(JSON.stringify(payload)).not.toContain("actorHolderDID");
      expect(JSON.stringify(payload)).not.toContain("privateField");
      expect(JSON.stringify(payload)).not.toContain("contract document");
    });
  });

  it("returns public transaction proof by tx hash", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/public/audit/tx/0xmockaward`);

      expect(response.status).toBe(200);
      const payload = await readJson<{
        txHash: string;
        blockchainTransaction: Record<string, unknown>;
        proofs: Array<Record<string, unknown>>;
        timeline: Array<Record<string, unknown>>;
      }>(response);

      expect(payload.txHash).toBe("0xmockaward");
      expect(payload.blockchainTransaction).toMatchObject({
        action: "AWARD_APPROVED",
        status: "MOCK_CONFIRMED"
      });
      expect(payload.proofs).toHaveLength(1);
      expect(payload.timeline.map((event) => event.txHash)).toContain("0xmockaward");
    });
  });
});
