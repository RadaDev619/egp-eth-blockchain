import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../../src/types/domain.js";
import { AppError } from "../../src/utils/errors.js";
import { hashDocumentBuffer } from "../../src/utils/hashDocument.js";

const users = vi.hoisted(() => {
  const base = {
    userId: "user",
    profileId: "profile",
    holderDID: "did:key:mock",
    employmentId: "MOCK-001",
    employer: "Mock Employer",
    position: "Mock Position",
    employmentType: "Regular"
  };

  return {
    proc: {
      ...base,
      userId: "proc-user",
      employmentId: "PROC-001",
      employeeHash: "0xproc",
      role: "PROCUREMENT_OFFICER",
      permissions: ["CREATE_TENDER", "CREATE_TENDER_VERSION", "CANCEL_TENDER"]
    },
    vendor: {
      ...base,
      userId: "vendor-user",
      employmentId: "VEND-001",
      employeeHash: "0xvendor",
      role: "VENDOR",
      permissions: ["SUBMIT_BID"]
    },
    evaluator: {
      ...base,
      userId: "eval-user",
      employmentId: "EVAL-001",
      employeeHash: "0xeval",
      role: "EVALUATOR",
      permissions: ["APPROVE_EVALUATION"]
    },
    finance: {
      ...base,
      userId: "fin-user",
      employmentId: "FIN-001",
      employeeHash: "0xfin",
      role: "FINANCE_OFFICER",
      permissions: ["APPROVE_PAYMENT"]
    },
    auditor: {
      ...base,
      userId: "aud-user",
      employmentId: "AUD-001",
      employeeHash: "0xauditor",
      role: "AUDITOR",
      permissions: ["VERIFY_DOCUMENT", "VIEW_AUDIT_LOGS"]
    }
  } satisfies Record<string, AuthenticatedUser>;
});

const db = vi.hoisted(() => ({
  tenderSeq: 0,
  versionSeq: 0,
  bidSeq: 0,
  approvalSeq: 0,
  transitionSeq: 0,
  blockchainSeq: 0,
  auditSeq: 0,
  tenders: [] as Array<Record<string, unknown>>,
  versions: [] as Array<Record<string, unknown>>,
  bids: [] as Array<Record<string, unknown>>,
  approvals: [] as Array<Record<string, unknown>>,
  transitions: [] as Array<Record<string, unknown>>,
  blockchainTransactions: [] as Array<Record<string, unknown>>,
  auditLogs: [] as Array<Record<string, unknown>>,
  reset() {
    this.tenderSeq = 0;
    this.versionSeq = 0;
    this.bidSeq = 0;
    this.approvalSeq = 0;
    this.transitionSeq = 0;
    this.blockchainSeq = 0;
    this.auditSeq = 0;
    this.tenders.length = 0;
    this.versions.length = 0;
    this.bids.length = 0;
    this.approvals.length = 0;
    this.transitions.length = 0;
    this.blockchainTransactions.length = 0;
    this.auditLogs.length = 0;
  }
}));

type MockRelayerResult = {
  txHash: string;
  status: "CONFIRMED" | "PENDING" | "FAILED" | "MOCK_CONFIRMED";
  network: "mock" | "local" | "sepolia";
  blockNumber: number | null;
  chainId: number | null;
  contractAddress: string | null;
  relayerAddress: string | null;
  explorerUrl: string | null;
  mock: boolean;
};

const relayerMocks = vi.hoisted(() => {
  const result = (action: string, resourceId = "resource"): MockRelayerResult => ({
    txHash: `0xmock${action.toLowerCase()}${resourceId}`.padEnd(64, "0").slice(0, 64),
    status: "MOCK_CONFIRMED",
    network: "mock",
    blockNumber: 0,
    chainId: 31337,
    contractAddress: "mock-contract",
    relayerAddress: "mock-relayer",
    explorerUrl: null,
    mock: true
  });

  return {
    recordTenderCreated: vi.fn(async (input: { tenderId: string }) => result("create", input.tenderId)),
    recordTenderVersionCreated: vi.fn(async (input: { tenderId: string }) => result("version", input.tenderId)),
    recordBidSubmitted: vi.fn(async (input: { tenderId: string }) => result("bid", input.tenderId)),
    recordEvaluationApproved: vi.fn(async (input: { tenderId: string }) => result("evaluation", input.tenderId)),
    recordPaymentApproved: vi.fn(async (input: { tenderId: string }) => result("payment", input.tenderId)),
    recordTamperingDetected: vi.fn(async (input: { tenderId: string }) => result("tamper", input.tenderId)),
    getTransactionStatus: vi.fn(),
    getExplorerUrl: vi.fn(() => null)
  };
});

type DbSnapshot = {
  tenderSeq: number;
  versionSeq: number;
  bidSeq: number;
  approvalSeq: number;
  transitionSeq: number;
  blockchainSeq: number;
  auditSeq: number;
  tenders: Array<Record<string, unknown>>;
  versions: Array<Record<string, unknown>>;
  bids: Array<Record<string, unknown>>;
  approvals: Array<Record<string, unknown>>;
  transitions: Array<Record<string, unknown>>;
  blockchainTransactions: Array<Record<string, unknown>>;
  auditLogs: Array<Record<string, unknown>>;
};

function cloneRecords(records: Array<Record<string, unknown>>) {
  return records.map((record) => ({ ...record }));
}

function snapshotDb(): DbSnapshot {
  return {
    tenderSeq: db.tenderSeq,
    versionSeq: db.versionSeq,
    bidSeq: db.bidSeq,
    approvalSeq: db.approvalSeq,
    transitionSeq: db.transitionSeq,
    blockchainSeq: db.blockchainSeq,
    auditSeq: db.auditSeq,
    tenders: cloneRecords(db.tenders),
    versions: cloneRecords(db.versions),
    bids: cloneRecords(db.bids),
    approvals: cloneRecords(db.approvals),
    transitions: cloneRecords(db.transitions),
    blockchainTransactions: cloneRecords(db.blockchainTransactions),
    auditLogs: cloneRecords(db.auditLogs)
  };
}

function restoreDb(snapshot: DbSnapshot) {
  db.tenderSeq = snapshot.tenderSeq;
  db.versionSeq = snapshot.versionSeq;
  db.bidSeq = snapshot.bidSeq;
  db.approvalSeq = snapshot.approvalSeq;
  db.transitionSeq = snapshot.transitionSeq;
  db.blockchainSeq = snapshot.blockchainSeq;
  db.auditSeq = snapshot.auditSeq;
  db.tenders.splice(0, db.tenders.length, ...cloneRecords(snapshot.tenders));
  db.versions.splice(0, db.versions.length, ...cloneRecords(snapshot.versions));
  db.bids.splice(0, db.bids.length, ...cloneRecords(snapshot.bids));
  db.approvals.splice(0, db.approvals.length, ...cloneRecords(snapshot.approvals));
  db.transitions.splice(0, db.transitions.length, ...cloneRecords(snapshot.transitions));
  db.blockchainTransactions.splice(0, db.blockchainTransactions.length, ...cloneRecords(snapshot.blockchainTransactions));
  db.auditLogs.splice(0, db.auditLogs.length, ...cloneRecords(snapshot.auditLogs));
}

function tenderWithRelations(tender: Record<string, unknown>) {
  return {
    ...tender,
    versions: db.versions.filter((version) => version.tenderId === tender.id),
    bids: db.bids.filter((bid) => bid.tenderId === tender.id),
    approvals: db.approvals.filter((approval) => approval.tenderId === tender.id),
    transitions: db.transitions.filter((transition) => transition.tenderId === tender.id)
  };
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

vi.mock("../../src/services/relayer.js", () => relayerMocks);

vi.mock("../../src/utils/prisma.js", () => {
  const prisma = {
    tender: {
      create: vi.fn(async ({ data }) => {
        const tender = {
          id: `tender-${++db.tenderSeq}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data
        };
        db.tenders.push(tender);
        return tender;
      }),
      findUnique: vi.fn(async ({ where }) => {
        const tender = db.tenders.find((candidate) => candidate.id === where.id);
        return tender ? tenderWithRelations(tender) : null;
      }),
      findMany: vi.fn(async () => db.tenders.map(tenderWithRelations)),
      update: vi.fn(async ({ where, data }) => {
        const tender = db.tenders.find((candidate) => candidate.id === where.id);
        if (!tender) {
          return null;
        }

        Object.assign(tender, data, { updatedAt: new Date() });
        return tenderWithRelations(tender);
      })
    },
    tenderVersion: {
      create: vi.fn(async ({ data }) => {
        const version = {
          id: `version-${++db.versionSeq}`,
          createdAt: new Date(),
          ...data
        };
        db.versions.push(version);
        return version;
      })
    },
    bid: {
      create: vi.fn(async ({ data }) => {
        const bid = {
          id: `bid-${++db.bidSeq}`,
          createdAt: new Date(),
          ...data
        };
        db.bids.push(bid);
        return bid;
      })
    },
    approval: {
      create: vi.fn(async ({ data }) => {
        const approval = {
          id: `approval-${++db.approvalSeq}`,
          createdAt: new Date(),
          ...data
        };
        db.approvals.push(approval);
        return approval;
      })
    },
    procurementTransition: {
      create: vi.fn(async ({ data }) => {
        const transition = {
          id: `transition-${++db.transitionSeq}`,
          createdAt: new Date(),
          ...data
        };
        db.transitions.push(transition);
        return transition;
      })
    },
    blockchainTransaction: {
      create: vi.fn(async ({ data }) => {
        const transaction = {
          id: `blockchain-${++db.blockchainSeq}`,
          createdAt: new Date(),
          ...data
        };
        db.blockchainTransactions.push(transaction);
        return transaction;
      })
    },
    auditLog: {
      create: vi.fn(async ({ data }) => {
        const audit = {
          id: `audit-${++db.auditSeq}`,
          createdAt: new Date(),
          ...data
        };
        db.auditLogs.push(audit);
        return audit;
      }),
      findMany: vi.fn(async () => db.auditLogs)
    },
    $transaction: vi.fn(async (callback) => {
      const snapshot = snapshotDb();

      try {
        return await callback(prisma);
      } catch (error) {
        restoreDb(snapshot);
        throw error;
      }
    })
  };

  return { prisma };
});

const { createApp } = await import("../../src/app.js");

type JsonObject = Record<string, unknown>;

async function readJson(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
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

function auth(token: keyof typeof users) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json"
  };
}

function authOnly(token: keyof typeof users) {
  return {
    authorization: `Bearer ${token}`
  };
}

const initialTenderPdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const tamperedTenderPdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Tampered true >>\nendobj\n%%EOF\n");

function pdfForm(fields: Record<string, string>, buffer = initialTenderPdf, filename = "tender.pdf") {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }

  form.append("document", new Blob([buffer], { type: "application/pdf" }), filename);
  return form;
}

async function createDemoTender(baseUrl: string) {
  const response = await fetch(`${baseUrl}/tender/create`, {
    method: "POST",
    headers: auth("proc"),
    body: JSON.stringify({
      tenderCode: `TDR-${db.tenderSeq + 1}`,
      agency: "Ministry of Finance",
      title: "Bridge Works",
      description: "Initial bridge maintenance tender",
      documentHash: "0xdocumenthash"
    })
  });

  expect(response.status).toBe(201);
  return readJson(response);
}

async function createDemoTenderWithPdf(baseUrl: string) {
  const response = await fetch(`${baseUrl}/tender/create`, {
    method: "POST",
    headers: authOnly("proc"),
    body: pdfForm({
      tenderCode: `PDF-${db.tenderSeq + 1}`,
      agency: "Ministry of Finance",
      title: "Bridge Works PDF",
      description: "Initial bridge maintenance tender document",
      documentHash: "0xfrontendprovidedhash",
      ipfsCid: "frontend-provided-cid"
    })
  });

  expect(response.status).toBe(201);
  return readJson(response);
}

describe("procurement routes", () => {
  beforeEach(() => {
    db.reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("runs the core valid workflow with mock blockchain audit records", async () => {
    await withServer(async (baseUrl) => {
      const createPayload = await createDemoTender(baseUrl);
      const createdTender = createPayload.tender as JsonObject;
      expect(createdTender.currentState).toBe("CREATED");

      const bidResponse = await fetch(`${baseUrl}/bid/submit`, {
        method: "POST",
        headers: auth("vendor"),
        body: JSON.stringify({
          tenderId: createdTender.id,
          bidHash: "0xbidhash"
        })
      });
      expect(bidResponse.status).toBe(201);
      expect(((await readJson(bidResponse)).tender as JsonObject).currentState).toBe("BID_SUBMITTED");

      const evaluationResponse = await fetch(`${baseUrl}/approve/evaluation`, {
        method: "POST",
        headers: auth("evaluator"),
        body: JSON.stringify({
          tenderId: createdTender.id,
          comments: "Evaluation approved"
        })
      });
      expect(evaluationResponse.status).toBe(200);
      expect(((await readJson(evaluationResponse)).tender as JsonObject).currentState).toBe("EVALUATION_APPROVED");

      const paymentResponse = await fetch(`${baseUrl}/approve/payment`, {
        method: "POST",
        headers: auth("finance"),
        body: JSON.stringify({
          tenderId: createdTender.id,
          comments: "Payment approved"
        })
      });
      expect(paymentResponse.status).toBe(200);
      expect(((await readJson(paymentResponse)).tender as JsonObject).currentState).toBe("PAYMENT_APPROVED");

      expect(db.transitions.map((transition) => transition.action)).toEqual([
        "CREATE_TENDER",
        "SUBMIT_BID",
        "APPROVE_EVALUATION",
        "APPROVE_PAYMENT"
      ]);
      expect(db.transitions.every((transition) => transition.allowed === true)).toBe(true);
      expect(db.auditLogs.map((audit) => audit.action)).toEqual([
        "TENDER_CREATED",
        "BID_SUBMITTED",
        "EVALUATION_APPROVED",
        "PAYMENT_APPROVED"
      ]);
      expect(db.auditLogs.every((audit) => audit.status === "MOCK_CHAIN_CONFIRMED")).toBe(true);
      expect(db.blockchainTransactions).toHaveLength(4);
      expect(db.blockchainTransactions.every((transaction) => transaction.status === "MOCK_CONFIRMED")).toBe(true);
      expect(db.auditLogs.every((audit) => typeof audit.txHash === "string" && audit.blockchainStatus === "MOCK_CONFIRMED")).toBe(
        true
      );
      expect(relayerMocks.recordTenderCreated).toHaveBeenCalledTimes(1);
      expect(relayerMocks.recordBidSubmitted).toHaveBeenCalledTimes(1);
      expect(relayerMocks.recordEvaluationApproved).toHaveBeenCalledTimes(1);
      expect(relayerMocks.recordPaymentApproved).toHaveBeenCalledTimes(1);
      expect(db.tenders[0].createdTxHash).toBe(db.blockchainTransactions[0].txHash);
      expect(db.bids[0]).toMatchObject({
        txHash: db.blockchainTransactions[1].txHash,
        blockchainStatus: "MOCK_CONFIRMED"
      });
      expect(db.approvals[0]).toMatchObject({
        txHash: db.blockchainTransactions[2].txHash,
        blockchainStatus: "MOCK_CONFIRMED"
      });
      expect(db.approvals[1]).toMatchObject({
        txHash: db.blockchainTransactions[3].txHash,
        blockchainStatus: "MOCK_CONFIRMED"
      });
    });
  });

  it("blocks vendors from creating tenders before relayer submission", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/tender/create`, {
        method: "POST",
        headers: auth("vendor"),
        body: JSON.stringify({
          tenderCode: "TDR-VENDOR-CREATE",
          agency: "Demo Vendor Pvt Ltd",
          title: "Unauthorized tender",
          description: "Vendor attempt to create a tender",
          documentHash: "0xdocumenthash"
        })
      });

      expect(response.status).toBe(403);
      expect(db.tenders).toHaveLength(0);
      expect(db.versions).toHaveLength(0);
      expect(db.auditLogs.at(-1)).toMatchObject({
        action: "UNAUTHORIZED_ACTION_ATTEMPTED",
        status: "BLOCKED",
        actorRole: "VENDOR",
        permissionChecked: "CREATE_TENDER"
      });
      expect(relayerMocks.recordTenderCreated).not.toHaveBeenCalled();
      expect(db.blockchainTransactions).toHaveLength(0);
    });
  });

  it("blocks auditors from mutating procurement state", async () => {
    await withServer(async (baseUrl) => {
      const createPayload = await createDemoTender(baseUrl);
      const tender = createPayload.tender as JsonObject;

      const bidResponse = await fetch(`${baseUrl}/bid/submit`, {
        method: "POST",
        headers: auth("auditor"),
        body: JSON.stringify({
          tenderId: tender.id,
          bidHash: "0xauditorbidhash"
        })
      });
      expect(bidResponse.status).toBe(403);

      const evaluationResponse = await fetch(`${baseUrl}/approve/evaluation`, {
        method: "POST",
        headers: auth("auditor"),
        body: JSON.stringify({
          tenderId: tender.id,
          comments: "Auditor attempts evaluation mutation"
        })
      });
      expect(evaluationResponse.status).toBe(403);

      const paymentResponse = await fetch(`${baseUrl}/approve/payment`, {
        method: "POST",
        headers: auth("auditor"),
        body: JSON.stringify({
          tenderId: tender.id,
          comments: "Auditor attempts payment mutation"
        })
      });
      expect(paymentResponse.status).toBe(403);

      expect(db.tenders[0].currentState).toBe("CREATED");
      expect(db.bids).toHaveLength(0);
      expect(db.approvals).toHaveLength(0);
      expect(db.auditLogs.slice(-3).map((audit) => audit.action)).toEqual([
        "UNAUTHORIZED_ACTION_ATTEMPTED",
        "UNAUTHORIZED_ACTION_ATTEMPTED",
        "UNAUTHORIZED_ACTION_ATTEMPTED"
      ]);
      expect(db.auditLogs.slice(-3).every((audit) => audit.actorRole === "AUDITOR" && audit.status === "BLOCKED")).toBe(true);
      expect(relayerMocks.recordBidSubmitted).not.toHaveBeenCalled();
      expect(relayerMocks.recordEvaluationApproved).not.toHaveBeenCalled();
      expect(relayerMocks.recordPaymentApproved).not.toHaveBeenCalled();
      expect(db.blockchainTransactions).toHaveLength(1);
    });
  });

  it("rolls back procurement writes when relayer submission throws", async () => {
    relayerMocks.recordTenderCreated.mockRejectedValueOnce(
      new AppError(502, "RELAYER_TRANSACTION_ERROR", "Blockchain relayer transaction failed.")
    );

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/tender/create`, {
        method: "POST",
        headers: auth("proc"),
        body: JSON.stringify({
          tenderCode: "TDR-RELAYER-FAIL",
          agency: "Ministry of Finance",
          title: "Bridge Works",
          description: "Initial bridge maintenance tender",
          documentHash: "0xdocumenthash"
        })
      });

      expect(response.status).toBe(502);
      expect((await readJson(response)).error).toMatchObject({
        code: "RELAYER_TRANSACTION_ERROR"
      });
      expect(relayerMocks.recordTenderCreated).toHaveBeenCalledTimes(1);
      expect(db.tenders).toHaveLength(0);
      expect(db.versions).toHaveLength(0);
      expect(db.transitions).toHaveLength(0);
      expect(db.blockchainTransactions).toHaveLength(0);
      expect(db.auditLogs).toHaveLength(0);
    });
  });

  it("does not mark a procurement action confirmed when relayer returns FAILED", async () => {
    await withServer(async (baseUrl) => {
      const createPayload = await createDemoTender(baseUrl);
      const tender = createPayload.tender as JsonObject;

      relayerMocks.recordBidSubmitted.mockResolvedValueOnce({
        txHash: "0xfailedrelayer",
        status: "FAILED",
        network: "local",
        blockNumber: null,
        chainId: 31337,
        contractAddress: "mock-contract",
        relayerAddress: "mock-relayer",
        explorerUrl: null,
        mock: false
      });

      const response = await fetch(`${baseUrl}/bid/submit`, {
        method: "POST",
        headers: auth("vendor"),
        body: JSON.stringify({
          tenderId: tender.id,
          bidHash: "0xbidhash"
        })
      });

      expect(response.status).toBe(502);
      expect((await readJson(response)).error).toMatchObject({
        code: "RELAYER_TRANSACTION_ERROR"
      });
      expect(relayerMocks.recordBidSubmitted).toHaveBeenCalledTimes(1);
      expect(db.tenders[0].currentState).toBe("CREATED");
      expect(db.bids).toHaveLength(0);
      expect(db.transitions).toHaveLength(1);
      expect(db.blockchainTransactions).toHaveLength(1);
      expect(db.auditLogs.map((audit) => audit.action)).toEqual(["TENDER_CREATED"]);
      expect(db.blockchainTransactions.some((transaction) => transaction.txHash === "0xfailedrelayer")).toBe(false);
    });
  });

  it("logs an invalid transition when finance approves payment before evaluation", async () => {
    await withServer(async (baseUrl) => {
      const createPayload = await createDemoTender(baseUrl);
      const tender = createPayload.tender as JsonObject;

      const response = await fetch(`${baseUrl}/approve/payment`, {
        method: "POST",
        headers: auth("finance"),
        body: JSON.stringify({
          tenderId: tender.id,
          comments: "Premature payment"
        })
      });

      expect(response.status).toBe(409);
      expect(db.transitions.at(-1)).toMatchObject({
        action: "APPROVE_PAYMENT",
        allowed: false,
        rejectionReason: "EVALUATION_REQUIRED_BEFORE_PAYMENT"
      });
      expect(db.auditLogs.at(-1)).toMatchObject({
        action: "INVALID_TRANSITION_ATTEMPTED",
        status: "BLOCKED",
        rejectionReason: "EVALUATION_REQUIRED_BEFORE_PAYMENT"
      });
      expect(db.blockchainTransactions).toHaveLength(1);
      expect(db.blockchainTransactions.some((transaction) => transaction.action === "PAYMENT_APPROVED")).toBe(false);
      expect(relayerMocks.recordTenderCreated).toHaveBeenCalledTimes(1);
      expect(relayerMocks.recordPaymentApproved).not.toHaveBeenCalled();
    });
  });

  it("logs unauthorized attempts when a vendor tries to approve payment", async () => {
    await withServer(async (baseUrl) => {
      const createPayload = await createDemoTender(baseUrl);
      const tender = createPayload.tender as JsonObject;

      const response = await fetch(`${baseUrl}/approve/payment`, {
        method: "POST",
        headers: auth("vendor"),
        body: JSON.stringify({
          tenderId: tender.id
        })
      });

      expect(response.status).toBe(403);
      expect(db.auditLogs.at(-1)).toMatchObject({
        action: "UNAUTHORIZED_ACTION_ATTEMPTED",
        status: "BLOCKED",
        actorRole: "VENDOR",
        permissionChecked: "APPROVE_PAYMENT"
      });
      expect(db.blockchainTransactions).toHaveLength(1);
      expect(db.blockchainTransactions.some((transaction) => transaction.action === "PAYMENT_APPROVED")).toBe(false);
      expect(relayerMocks.recordTenderCreated).toHaveBeenCalledTimes(1);
      expect(relayerMocks.recordPaymentApproved).not.toHaveBeenCalled();
    });
  });

  it("amends by creating a new tender version without overwriting version one", async () => {
    await withServer(async (baseUrl) => {
      const createPayload = await createDemoTender(baseUrl);
      const tender = createPayload.tender as JsonObject;

      const response = await fetch(`${baseUrl}/tender/amend`, {
        method: "POST",
        headers: auth("proc"),
        body: JSON.stringify({
          tenderId: tender.id,
          title: "Bridge Works Revised",
          description: "Revised scope",
          documentHash: "0xreviseddoc",
          changeReason: "Clarified bill of quantities"
        })
      });

      expect(response.status).toBe(200);
      expect(db.versions).toHaveLength(2);
      expect(db.versions[0]).toMatchObject({
        versionNumber: 1,
        title: "Bridge Works",
        documentHash: "0xdocumenthash"
      });
      expect(db.versions[1]).toMatchObject({
        versionNumber: 2,
        title: "Bridge Works Revised",
        documentHash: "0xreviseddoc"
      });
      expect(db.auditLogs.at(-1)).toMatchObject({
        action: "TENDER_VERSION_CREATED",
        transitionAllowed: true,
        txHash: db.blockchainTransactions.at(-1)?.txHash,
        blockchainStatus: "MOCK_CONFIRMED"
      });
      expect(relayerMocks.recordTenderVersionCreated).toHaveBeenCalledTimes(1);
      expect(db.versions[1].txHash).toBe(db.blockchainTransactions.at(-1)?.txHash);
    });
  });

  it("stores uploaded tender PDFs with a server-computed document hash and mock CID", async () => {
    await withServer(async (baseUrl) => {
      await createDemoTenderWithPdf(baseUrl);

      expect(db.versions[0]).toMatchObject({
        documentHash: hashDocumentBuffer(initialTenderPdf),
        ipfsCid: expect.stringMatching(/^mock-cid-/)
      });
      expect(db.versions[0].documentHash).not.toBe("0xfrontendprovidedhash");
      expect(db.versions[0].ipfsCid).not.toBe("frontend-provided-cid");
      expect(relayerMocks.recordTenderCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          documentHash: hashDocumentBuffer(initialTenderPdf),
          ipfsCid: expect.stringMatching(/^mock-cid-/)
        })
      );
      expect(db.auditLogs[0]).toMatchObject({
        action: "TENDER_CREATED",
        documentHash: hashDocumentBuffer(initialTenderPdf),
        ipfsCid: expect.stringMatching(/^mock-cid-/)
      });
      expect(JSON.stringify(db.auditLogs[0])).not.toContain("%PDF");
    });
  });

  it("passes document verification when the uploaded PDF matches the stored tender version hash", async () => {
    await withServer(async (baseUrl) => {
      const createPayload = await createDemoTenderWithPdf(baseUrl);
      const tender = createPayload.tender as JsonObject;

      const response = await fetch(`${baseUrl}/verify/document`, {
        method: "POST",
        headers: authOnly("auditor"),
        body: pdfForm({
          tenderId: String(tender.id),
          versionNumber: "1"
        })
      });

      expect(response.status).toBe(200);
      expect(await readJson(response)).toMatchObject({
        verified: true,
        tamperingDetected: false,
        tenderId: tender.id,
        expectedDocumentHash: hashDocumentBuffer(initialTenderPdf),
        uploadedDocumentHash: hashDocumentBuffer(initialTenderPdf),
        txHash: null,
        blockchainStatus: null
      });
      expect(db.transitions.at(-1)).toMatchObject({
        action: "VERIFY_DOCUMENT",
        allowed: true
      });
      expect(db.auditLogs.at(-1)).toMatchObject({
        action: "DOCUMENT_VERIFICATION_PASSED",
        status: "SUCCESS",
        actorRole: "AUDITOR",
        documentHash: hashDocumentBuffer(initialTenderPdf)
      });
      expect(relayerMocks.recordTamperingDetected).not.toHaveBeenCalled();
    });
  });

  it("logs failed verification and anchors tampering detection when document hashes differ", async () => {
    await withServer(async (baseUrl) => {
      const createPayload = await createDemoTenderWithPdf(baseUrl);
      const tender = createPayload.tender as JsonObject;

      const response = await fetch(`${baseUrl}/verify/document`, {
        method: "POST",
        headers: authOnly("auditor"),
        body: pdfForm(
          {
            tenderId: String(tender.id),
            versionNumber: "1"
          },
          tamperedTenderPdf,
          "tampered.pdf"
        )
      });

      expect(response.status).toBe(200);
      expect(await readJson(response)).toMatchObject({
        verified: false,
        tamperingDetected: true,
        expectedDocumentHash: hashDocumentBuffer(initialTenderPdf),
        uploadedDocumentHash: hashDocumentBuffer(tamperedTenderPdf),
        blockchainStatus: "MOCK_CONFIRMED"
      });
      expect(db.auditLogs.at(-2)).toMatchObject({
        action: "DOCUMENT_VERIFICATION_FAILED",
        status: "FAILED",
        documentHash: hashDocumentBuffer(tamperedTenderPdf)
      });
      expect(db.auditLogs.at(-1)).toMatchObject({
        action: "TAMPERING_DETECTED",
        status: "MOCK_CHAIN_CONFIRMED",
        txHash: db.blockchainTransactions.at(-1)?.txHash,
        blockchainStatus: "MOCK_CONFIRMED"
      });
      expect(db.blockchainTransactions.at(-1)).toMatchObject({
        action: "TAMPERING_DETECTED",
        resourceType: "DOCUMENT",
        status: "MOCK_CONFIRMED"
      });
      expect(relayerMocks.recordTamperingDetected).toHaveBeenCalledWith(
        expect.objectContaining({
          tenderId: tender.id,
          actorEmployeeHash: "0xauditor",
          actorRole: "AUDITOR",
          expectedDocumentHash: hashDocumentBuffer(initialTenderPdf),
          observedDocumentHash: hashDocumentBuffer(tamperedTenderPdf)
        })
      );
      expect(JSON.stringify(db.auditLogs.at(-1))).not.toContain("%PDF");
    });
  });
});
