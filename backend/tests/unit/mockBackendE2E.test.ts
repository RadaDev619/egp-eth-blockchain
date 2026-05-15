import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "../../src/utils/hash.js";

vi.stubEnv("BLOCKCHAIN_MODE", "mock");
vi.stubEnv("NDI_MODE", "mock");
vi.stubEnv("JWT_SECRET", "phase-ten-local-development-secret");
vi.stubEnv("EMPLOYEE_HASH_SALT", "phase-ten-local-salt");
vi.stubEnv("RELAYER_PRIVATE_KEY", "");

type RecordData = Record<string, any>;

const db = vi.hoisted(() => ({
  proofSeq: 0,
  profileSeq: 0,
  tenderSeq: 0,
  versionSeq: 0,
  bidSeq: 0,
  approvalSeq: 0,
  transitionSeq: 0,
  blockchainSeq: 0,
  auditSeq: 0,
  proofRequests: [] as RecordData[],
  profiles: [] as RecordData[],
  users: [] as RecordData[],
  sessions: [] as RecordData[],
  tenders: [] as RecordData[],
  versions: [] as RecordData[],
  bids: [] as RecordData[],
  approvals: [] as RecordData[],
  transitions: [] as RecordData[],
  blockchainTransactions: [] as RecordData[],
  auditLogs: [] as RecordData[],
  reset() {
    this.proofSeq = 0;
    this.profileSeq = 0;
    this.tenderSeq = 0;
    this.versionSeq = 0;
    this.bidSeq = 0;
    this.approvalSeq = 0;
    this.transitionSeq = 0;
    this.blockchainSeq = 0;
    this.auditSeq = 0;
    this.proofRequests.length = 0;
    this.profiles.length = 0;
    this.users.length = 0;
    this.sessions.length = 0;
    this.tenders.length = 0;
    this.versions.length = 0;
    this.bids.length = 0;
    this.approvals.length = 0;
    this.transitions.length = 0;
    this.blockchainTransactions.length = 0;
    this.auditLogs.length = 0;
  }
}));

type DbSnapshot = Omit<typeof db, "reset">;

function cloneRecords(records: RecordData[]) {
  return records.map((record) => ({ ...record }));
}

function snapshotDb(): DbSnapshot {
  return {
    proofSeq: db.proofSeq,
    profileSeq: db.profileSeq,
    tenderSeq: db.tenderSeq,
    versionSeq: db.versionSeq,
    bidSeq: db.bidSeq,
    approvalSeq: db.approvalSeq,
    transitionSeq: db.transitionSeq,
    blockchainSeq: db.blockchainSeq,
    auditSeq: db.auditSeq,
    proofRequests: cloneRecords(db.proofRequests),
    profiles: cloneRecords(db.profiles),
    users: cloneRecords(db.users),
    sessions: cloneRecords(db.sessions),
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
  db.proofSeq = snapshot.proofSeq;
  db.profileSeq = snapshot.profileSeq;
  db.tenderSeq = snapshot.tenderSeq;
  db.versionSeq = snapshot.versionSeq;
  db.bidSeq = snapshot.bidSeq;
  db.approvalSeq = snapshot.approvalSeq;
  db.transitionSeq = snapshot.transitionSeq;
  db.blockchainSeq = snapshot.blockchainSeq;
  db.auditSeq = snapshot.auditSeq;
  db.proofRequests.splice(0, db.proofRequests.length, ...cloneRecords(snapshot.proofRequests));
  db.profiles.splice(0, db.profiles.length, ...cloneRecords(snapshot.profiles));
  db.users.splice(0, db.users.length, ...cloneRecords(snapshot.users));
  db.sessions.splice(0, db.sessions.length, ...cloneRecords(snapshot.sessions));
  db.tenders.splice(0, db.tenders.length, ...cloneRecords(snapshot.tenders));
  db.versions.splice(0, db.versions.length, ...cloneRecords(snapshot.versions));
  db.bids.splice(0, db.bids.length, ...cloneRecords(snapshot.bids));
  db.approvals.splice(0, db.approvals.length, ...cloneRecords(snapshot.approvals));
  db.transitions.splice(0, db.transitions.length, ...cloneRecords(snapshot.transitions));
  db.blockchainTransactions.splice(0, db.blockchainTransactions.length, ...cloneRecords(snapshot.blockchainTransactions));
  db.auditLogs.splice(0, db.auditLogs.length, ...cloneRecords(snapshot.auditLogs));
}

function tenderWithRelations(tender: RecordData) {
  return {
    ...tender,
    versions: db.versions.filter((version) => version.tenderId === tender.id),
    bids: db.bids.filter((bid) => bid.tenderId === tender.id),
    approvals: db.approvals.filter((approval) => approval.tenderId === tender.id),
    transitions: db.transitions.filter((transition) => transition.tenderId === tender.id)
  };
}

function applyWhere(records: RecordData[], where: RecordData = {}) {
  return records.filter((record) =>
    Object.entries(where).every(([key, value]) => value === undefined || record[key] === value)
  );
}

function sortCreatedAtAsc(records: RecordData[]) {
  return [...records].sort((left, right) => Number(left.createdAt) - Number(right.createdAt));
}

vi.mock("../../src/utils/prisma.js", () => {
  const prisma = {
    nDIProofRequest: {
      create: vi.fn(async ({ data }) => {
        const proofRequest = {
          id: `proof-${++db.proofSeq}`,
          createdAt: new Date(),
          ...data
        };
        db.proofRequests.push(proofRequest);
        return proofRequest;
      }),
      findUnique: vi.fn(async ({ where }) => db.proofRequests.find((proof) => proof.threadId === where.threadId) ?? null),
      update: vi.fn(async ({ where, data }) => {
        const proofRequest = db.proofRequests.find((proof) => proof.threadId === where.threadId);
        if (!proofRequest) {
          return null;
        }

        Object.assign(proofRequest, data);
        return proofRequest;
      })
    },
    nDIProfile: {
      upsert: vi.fn(async ({ where, create, update }) => {
        const existingProfile = db.profiles.find((candidate) => candidate.employmentId === where.employmentId);
        if (existingProfile) {
          Object.assign(existingProfile, update, { updatedAt: new Date() });
          return existingProfile;
        }

        const profile: RecordData = {
          id: `profile-${++db.profileSeq}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...create
        };
        db.profiles.push(profile);
        return profile;
      })
    },
    user: {
      upsert: vi.fn(async ({ where, create, update }) => {
        const existingUser = db.users.find((candidate) => candidate.id === where.id);
        if (existingUser) {
          Object.assign(existingUser, update, { updatedAt: new Date() });
          return existingUser;
        }

        const user: RecordData = {
          createdAt: new Date(),
          updatedAt: new Date(),
          isActive: true,
          ...create
        };
        db.users.push(user);
        return user;
      })
    },
    authSession: {
      create: vi.fn(async ({ data }) => {
        const session = {
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data
        };
        db.sessions.push(session);
        return session;
      }),
      findUnique: vi.fn(async ({ where }) => {
        const session = db.sessions.find((candidate) => candidate.id === where.id);
        if (!session) {
          return null;
        }

        const user = db.users.find((candidate) => candidate.id === session.userId);
        const ndiProfile = db.profiles.find((profile) => profile.id === user?.ndiProfileId);

        return {
          ...session,
          user: user && ndiProfile ? { ...user, ndiProfile } : user
        };
      }),
      deleteMany: vi.fn(async ({ where }) => {
        const before = db.sessions.length;
        db.sessions = db.sessions.filter((session) => session.sessionTokenHash !== where.sessionTokenHash);
        return { count: before - db.sessions.length };
      })
    },
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
      }),
      findMany: vi.fn(async ({ where = {} } = {}) => sortCreatedAtAsc(applyWhere(db.blockchainTransactions, where))),
      findUnique: vi.fn(async ({ where }) => db.blockchainTransactions.find((transaction) => transaction.txHash === where.txHash) ?? null)
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
      findMany: vi.fn(async ({ where = {} } = {}) => sortCreatedAtAsc(applyWhere(db.auditLogs, where)))
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

type JsonObject = Record<string, any>;

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

async function login(baseUrl: string, employmentId: string) {
  const startResponse = await fetch(`${baseUrl}/auth/ndi/start`, { method: "POST" });
  expect(startResponse.status).toBe(200);
  const startPayload = await readJson(startResponse);

  const completeResponse = await fetch(`${baseUrl}/auth/ndi/mock-complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      proofRequestThreadId: startPayload.proofRequestThreadId,
      employmentId
    })
  });

  expect(completeResponse.status).toBe(200);
  const completePayload = await readJson(completeResponse);

  return {
    token: completePayload.token as string,
    user: completePayload.user as JsonObject
  };
}

function auth(token: string) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json"
  };
}

describe("mock backend end-to-end procurement flow", () => {
  beforeEach(() => {
    db.reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("logs in through mock NDI and completes procurement with blocked bypass visible in auditor timeline", async () => {
    await withServer(async (baseUrl) => {
      const procurementOfficer = await login(baseUrl, "PROC-001");
      expect(procurementOfficer.user).toMatchObject({ role: "PROCUREMENT_OFFICER" });

      const createResponse = await fetch(`${baseUrl}/tender/create`, {
        method: "POST",
        headers: auth(procurementOfficer.token),
        body: JSON.stringify({
          tenderCode: "TDR-E2E-001",
          agency: "Ministry of Finance",
          title: "Road Maintenance",
          description: "Mock-mode e-GP tender",
          documentHash: "0xdocumenthash"
        })
      });
      expect(createResponse.status).toBe(201);
      const createdTender = (await readJson(createResponse)).tender as JsonObject;
      expect(createdTender.currentState).toBe("CREATED");

      const vendor = await login(baseUrl, "VEND-001");
      expect(vendor.user).toMatchObject({ role: "VENDOR" });
      const bidResponse = await fetch(`${baseUrl}/bid/submit`, {
        method: "POST",
        headers: auth(vendor.token),
        body: JSON.stringify({
          tenderId: createdTender.id,
          bidHash: "0xbidhash"
        })
      });
      expect(bidResponse.status).toBe(201);
      expect(((await readJson(bidResponse)).tender as JsonObject).currentState).toBe("BID_SUBMITTED");

      const finance = await login(baseUrl, "FIN-001");
      expect(finance.user).toMatchObject({ role: "FINANCE_OFFICER" });
      const blockedPaymentResponse = await fetch(`${baseUrl}/approve/payment`, {
        method: "POST",
        headers: auth(finance.token),
        body: JSON.stringify({
          tenderId: createdTender.id,
          comments: "Attempt payment before evaluation"
        })
      });
      expect(blockedPaymentResponse.status).toBe(409);
      expect((await readJson(blockedPaymentResponse)).error).toMatchObject({
        code: "INVALID_TRANSITION"
      });
      expect(db.blockchainTransactions.filter((transaction) => transaction.action === "PAYMENT_APPROVED")).toHaveLength(0);

      const evaluator = await login(baseUrl, "EVAL-001");
      expect(evaluator.user).toMatchObject({ role: "EVALUATOR" });
      const evaluationResponse = await fetch(`${baseUrl}/approve/evaluation`, {
        method: "POST",
        headers: auth(evaluator.token),
        body: JSON.stringify({
          tenderId: createdTender.id,
          comments: "Evaluation approved"
        })
      });
      expect(evaluationResponse.status).toBe(200);
      expect(((await readJson(evaluationResponse)).tender as JsonObject).currentState).toBe("EVALUATION_APPROVED");

      const paymentResponse = await fetch(`${baseUrl}/approve/payment`, {
        method: "POST",
        headers: auth(finance.token),
        body: JSON.stringify({
          tenderId: createdTender.id,
          comments: "Payment approved after evaluation"
        })
      });
      expect(paymentResponse.status).toBe(200);
      expect(((await readJson(paymentResponse)).tender as JsonObject).currentState).toBe("PAYMENT_APPROVED");

      const blockedVendorPaymentResponse = await fetch(`${baseUrl}/approve/payment`, {
        method: "POST",
        headers: auth(vendor.token),
        body: JSON.stringify({
          tenderId: createdTender.id,
          comments: "Vendor attempts restricted payment approval"
        })
      });
      expect(blockedVendorPaymentResponse.status).toBe(403);
      expect((await readJson(blockedVendorPaymentResponse)).error).toMatchObject({
        code: "AUTHORIZATION_ERROR"
      });
      expect(db.blockchainTransactions.filter((transaction) => transaction.action === "PAYMENT_APPROVED")).toHaveLength(1);

      const auditor = await login(baseUrl, "AUD-001");
      expect(auditor.user).toMatchObject({ role: "AUDITOR" });
      const timelineResponse = await fetch(`${baseUrl}/audit/tender/${createdTender.id}/timeline`, {
        headers: auth(auditor.token)
      });
      expect(timelineResponse.status).toBe(200);
      const timelinePayload = await readJson(timelineResponse);
      const timeline = timelinePayload.timeline as JsonObject[];
      const actions = timeline.map((event) => event.action);

      expect(actions).toEqual([
        "TENDER_CREATED",
        "BID_SUBMITTED",
        "INVALID_TRANSITION_ATTEMPTED",
        "EVALUATION_APPROVED",
        "PAYMENT_APPROVED",
        "UNAUTHORIZED_ACTION_ATTEMPTED"
      ]);
      const blockedEvent = timeline.find((event) => event.action === "INVALID_TRANSITION_ATTEMPTED");
      expect(blockedEvent).toMatchObject({
        status: "BLOCKED",
        actorRole: "FINANCE_OFFICER",
        rejectionReason: "EVALUATION_REQUIRED_BEFORE_PAYMENT"
      });
      expect(blockedEvent?.txHash ?? null).toBeNull();
      const vendorBlockedEvent = timeline.find((event) => event.action === "UNAUTHORIZED_ACTION_ATTEMPTED");
      expect(vendorBlockedEvent).toMatchObject({
        status: "BLOCKED",
        actorRole: "VENDOR",
        permissionChecked: "APPROVE_PAYMENT",
        permissionResult: "DENIED"
      });
      expect(vendorBlockedEvent?.txHash ?? null).toBeNull();
      expect(timeline.filter((event) => event.txHash)).toHaveLength(4);
      expect(timeline.filter((event) => event.blockchainStatus === "MOCK_CONFIRMED")).toHaveLength(4);
      expect(timeline.every((event) => !String(event.employeeHash ?? "").includes("PROC-001"))).toBe(true);
      expect(timeline.some((event) => event.employeeHash === `0x${sha256Hex(`PROC-001phase-ten-local-salt`)}`)).toBe(true);
      expect(timelinePayload.blockchainTransactions).toHaveLength(4);
      expect(
        (timelinePayload.blockchainTransactions as JsonObject[]).map((transaction) => transaction.action)
      ).toEqual(["TENDER_CREATED", "BID_SUBMITTED", "EVALUATION_APPROVED", "PAYMENT_APPROVED"]);

      const globalTimelineResponse = await fetch(`${baseUrl}/audit/logs?tenderId=${createdTender.id}`, {
        headers: auth(auditor.token)
      });
      expect(globalTimelineResponse.status).toBe(200);
      const globalTimeline = ((await readJson(globalTimelineResponse)).timeline as JsonObject[]).map((event) => event.action);
      expect(globalTimeline).toEqual(actions);
    });
  });
});
