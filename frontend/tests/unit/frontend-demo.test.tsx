import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditEventTimeline } from "@/components/AuditEventTimeline";
import { BlockchainProofCard } from "@/components/BlockchainProofCard";
import { Sidebar } from "@/components/Sidebar";
import type { AuditEvent, DocumentVerificationResponse } from "@/types/audit";
import type { AuthenticatedUser, DemoNdiProfile, Permission, Role } from "@/types/auth";
import type { Tender } from "@/types/procurement";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: "/dashboard",
  establishSession: vi.fn(),
  notify: vi.fn(),
  startNdiLogin: vi.fn(),
  listDemoProfiles: vi.fn(),
  completeMockNdiLogin: vi.fn(),
  approveEvaluation: vi.fn(),
  approvePayment: vi.fn(),
  listAuditLogs: vi.fn(),
  verifyDocument: vi.fn(),
  session: {
    user: null as AuthenticatedUser | null,
    loading: false,
    authenticated: false
  },
  tenders: {
    tenders: [] as Tender[],
    loading: false,
    error: null as string | null,
    refresh: vi.fn()
  }
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => mocks.pathname
}));

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>
}));

vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ notify: mocks.notify }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    ...mocks.session,
    establishSession: mocks.establishSession,
    refresh: vi.fn(),
    logout: vi.fn()
  })
}));

vi.mock("@/hooks/useTenders", () => ({
  useTenders: () => mocks.tenders
}));

vi.mock("@/services/apiClient", () => {
  class ApiClientError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string
    ) {
      super(message);
    }
  }

  return {
    ApiClientError,
    authApi: {
      startNdiLogin: mocks.startNdiLogin,
      listDemoProfiles: mocks.listDemoProfiles,
      completeMockNdiLogin: mocks.completeMockNdiLogin
    },
    approvalApi: {
      approveEvaluation: mocks.approveEvaluation,
      approvePayment: mocks.approvePayment
    },
    auditApi: {
      listLogs: mocks.listAuditLogs
    },
    verificationApi: {
      verifyDocument: mocks.verifyDocument
    }
  };
});

const demoProfiles: DemoNdiProfile[] = [
  {
    employmentId: "PROC-001",
    employer: "Ministry of Finance",
    position: "Procurement Officer",
    employmentType: "Regular",
    role: "PROCUREMENT_OFFICER"
  },
  {
    employmentId: "VEND-001",
    employer: "Demo Vendor Pvt Ltd",
    position: "Vendor Representative",
    employmentType: "Regular",
    role: "VENDOR"
  },
  {
    employmentId: "FIN-001",
    employer: "Ministry of Finance",
    position: "Finance Officer",
    employmentType: "Regular",
    role: "FINANCE_OFFICER"
  },
  {
    employmentId: "AUD-001",
    employer: "Royal Audit Authority",
    position: "Auditor",
    employmentType: "Regular",
    role: "AUDITOR"
  }
];

function user(role: Role, permissions: Permission[]): AuthenticatedUser {
  return {
    userId: `${role.toLowerCase()}-user`,
    holderDID: `did:key:${role.toLowerCase()}`,
    employmentId: role === "VENDOR" ? "VEND-001" : role === "AUDITOR" ? "AUD-001" : role === "FINANCE_OFFICER" ? "FIN-001" : "PROC-001",
    employeeHash: `0x${role.toLowerCase().replace(/_/g, "")}`.padEnd(66, "0"),
    employer: role === "VENDOR" ? "Demo Vendor Pvt Ltd" : "Ministry of Finance",
    position: role
      .split("_")
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(" "),
    employmentType: "Regular",
    role,
    permissions
  };
}

function tender(state: Tender["currentState"]): Tender {
  return {
    id: "tender-1",
    tenderCode: "TDR-DEMO-001",
    agency: "Ministry of Finance",
    currentState: state,
    currentVersion: 1,
    createdByEmployeeHash: "0xproc",
    createdByRole: "PROCUREMENT_OFFICER",
    createdTxHash: "0xmockcreate",
    createdAt: "2026-05-15T08:00:00.000Z",
    updatedAt: "2026-05-15T08:05:00.000Z",
    versions: [
      {
        id: "version-1",
        tenderId: "tender-1",
        versionNumber: 1,
        title: "Bridge Maintenance",
        description: "Demo tender",
        documentHash: "0xexpectedhash",
        ipfsCid: "mock-cid-v1",
        createdByEmployeeHash: "0xproc",
        createdByRole: "PROCUREMENT_OFFICER",
        txHash: "0xmockcreate",
        createdAt: "2026-05-15T08:00:00.000Z"
      }
    ],
    approvals: []
  };
}

const timelineEvents: AuditEvent[] = [
  {
    id: "audit-1",
    action: "TENDER_CREATED",
    status: "MOCK_CHAIN_CONFIRMED",
    actorRole: "PROCUREMENT_OFFICER",
    employeeHash: "0xprocurement000000000000000000000000000000000000000000000000000000",
    tenderId: "tender-1",
    fromState: null,
    toState: "CREATED",
    rejectionReason: null,
    txHash: "0xmockcreate",
    blockchainStatus: "MOCK_CONFIRMED",
    timestamp: "2026-05-15T08:00:00.000Z",
    createdAt: "2026-05-15T08:00:00.000Z"
  },
  {
    id: "audit-2",
    action: "INVALID_TRANSITION_ATTEMPTED",
    status: "BLOCKED",
    actorRole: "FINANCE_OFFICER",
    employeeHash: "0xfinance0000000000000000000000000000000000000000000000000000000",
    tenderId: "tender-1",
    fromState: "BID_SUBMITTED",
    toState: null,
    rejectionReason: "EVALUATION_REQUIRED_BEFORE_PAYMENT",
    txHash: null,
    blockchainStatus: null,
    timestamp: "2026-05-15T08:10:00.000Z",
    createdAt: "2026-05-15T08:10:00.000Z"
  }
];

function expectPresent(element: Element | null) {
  expect(element).not.toBeNull();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname = "/dashboard";
  mocks.session.user = null;
  mocks.session.loading = false;
  mocks.session.authenticated = false;
  mocks.tenders.tenders = [];
  mocks.tenders.loading = false;
  mocks.tenders.error = null;
  mocks.tenders.refresh = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("mock NDI login UI", () => {
  it("renders Bhutan NDI login copy and mock demo profiles", async () => {
    const LoginPage = (await import("@/app/login/page")).default;
    mocks.startNdiLogin.mockResolvedValue({
      mode: "mock",
      proofRequestThreadId: "mock-thread-1",
      threadId: "mock-thread-1",
      proofRequestURL: "https://mock.ndi/proof",
      proofRequestUrl: "https://mock.ndi/proof",
      deepLinkURL: "bhutan-ndi://mock",
      deepLinkUrl: "bhutan-ndi://mock",
      qrData: "mock",
      requestedAttributes: ["Employment ID", "Position", "Employment Type", "Employer"],
      demoProfiles
    });
    mocks.listDemoProfiles.mockResolvedValue({ profiles: demoProfiles });

    render(<LoginPage />);

    expect(screen.getAllByText(/Login with Bhutan NDI/i).length).toBeGreaterThan(0);
    expectPresent(await screen.findByText("Procurement Officer"));
    expectPresent(screen.getByText("Vendor Representative"));
    expect(screen.getAllByText("Mock NDI demo profile").length).toBeGreaterThan(0);
  });
});

describe("role-based navigation", () => {
  it("shows navigation items from backend session permissions", () => {
    mocks.pathname = "/audit";
    render(<Sidebar user={user("AUDITOR", ["VIEW_AUDIT_LOGS", "VERIFY_DOCUMENT", "VIEW_BLOCKCHAIN_PROOFS"])} />);

    expectPresent(screen.getByRole("link", { name: /Audit Logs/i }));
    expectPresent(screen.getByRole("link", { name: /Integrity Verification/i }));
    expectPresent(screen.getByRole("link", { name: /Blockchain Proofs/i }));
    expect(screen.queryByRole("link", { name: /^Bids$/i })).toBeNull();
  });

  it("hides payment approval navigation from vendors", () => {
    render(<Sidebar user={user("VENDOR", ["SUBMIT_BID", "VIEW_ELIGIBLE_TENDERS"])} />);

    expectPresent(screen.getByRole("link", { name: /^Bids$/i }));
    expect(screen.queryByRole("link", { name: /Approvals/i })).toBeNull();
  });
});

describe("forbidden frontend implementation terms", () => {
  it("does not contain disallowed browser-chain connection language", () => {
    const browserAccountWord = ["Wal", "let"].join("");
    const forbiddenTerms = [["Meta", "Mask"].join(""), `Connect ${browserAccountWord}`, `${browserAccountWord}Connect`];
    const root = path.resolve(__dirname, "../..");
    const files: string[] = [];

    function collectFiles(directory: string) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (["node_modules", ".next", "coverage", "test-results", "playwright-report"].includes(entry.name)) {
          continue;
        }

        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          collectFiles(fullPath);
        } else if (/\.(ts|tsx|js|jsx|md)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
    }

    collectFiles(root);
    const combinedSource = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");

    for (const term of forbiddenTerms) {
      expect(combinedSource).not.toContain(term);
    }
  });
});

describe("blocked approval UX", () => {
  it("shows a blocked alert when finance attempts payment before evaluation", async () => {
    const ApprovalsPage = (await import("@/app/approvals/page")).default;
    const { ApiClientError } = await import("@/services/apiClient");
    mocks.session.user = user("FINANCE_OFFICER", ["APPROVE_PAYMENT"]);
    mocks.tenders.tenders = [tender("BID_SUBMITTED")];
    mocks.approvePayment.mockRejectedValue(new ApiClientError(409, "INVALID_TRANSITION", "Evaluation required before payment."));

    render(<ApprovalsPage />);
    await userEvent.click(screen.getByRole("button", { name: /Attempt for Demo Audit/i }));

    expectPresent(await screen.findByText("Approval action blocked"));
    expectPresent(screen.getByText("This procurement action is not allowed in the current workflow state. The blocked attempt is recorded for auditor review."));
  });

  it("shows a vendor blocked alert instead of payment approval controls", async () => {
    const ApprovalsPage = (await import("@/app/approvals/page")).default;
    mocks.session.user = user("VENDOR", ["SUBMIT_BID"]);
    mocks.tenders.tenders = [tender("EVALUATION_APPROVED")];

    render(<ApprovalsPage />);

    expectPresent(screen.getByText("Approval actions hidden"));
    expectPresent(screen.getByText("Only Evaluator and Finance Officer sessions can perform approval actions."));
    expect((screen.getByRole("button", { name: /^Submit Approval$/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("audit and proof components", () => {
  it("renders successful and blocked events in the auditor timeline", () => {
    render(<AuditEventTimeline events={timelineEvents} />);

    expectPresent(screen.getByText("Tender Created"));
    expectPresent(screen.getByText("Invalid Transition Attempted"));
    expectPresent(screen.getByText("Blocked"));
    expectPresent(screen.getByText("EVALUATION_REQUIRED_BEFORE_PAYMENT"));
    expect(screen.getAllByText("0xmockcreate").length).toBeGreaterThan(0);
  });

  it("renders transaction hash evidence in the backend relayer proof card", () => {
    render(<BlockchainProofCard txHash="0xmockpay" status="MOCK_CONFIRMED" />);

    expectPresent(screen.getByText("Backend Relayer Proof"));
    expectPresent(screen.getByText("Procurement proof submitted gaslessly by the backend relayer after validation."));
    expectPresent(screen.getByText("0xmockpay"));
    expectPresent(screen.getByText("MOCK_CONFIRMED"));
  });
});

describe("document verification UI", () => {
  it("shows TAMPERING DETECTED when backend verification reports a mismatch", async () => {
    const VerifyPage = (await import("@/app/verify/page")).default;
    mocks.session.user = user("AUDITOR", ["VERIFY_DOCUMENT"]);
    mocks.tenders.tenders = [tender("PAYMENT_APPROVED")];
    const mismatch: DocumentVerificationResponse = {
      verified: false,
      tamperingDetected: true,
      tenderId: "tender-1",
      tenderVersionId: "version-1",
      versionNumber: 1,
      expectedDocumentHash: "0xexpectedhash",
      uploadedDocumentHash: "0xuploadedhash",
      ipfsCid: "mock-cid-v1",
      txHash: "0xmocktamper",
      blockchainStatus: "MOCK_CONFIRMED"
    };
    mocks.verifyDocument.mockResolvedValue(mismatch);

    render(<VerifyPage />);

    const file = new File(["tampered"], "tampered.pdf", { type: "application/pdf" });
    const fileInput = screen.getByLabelText(/PDF Document/i);
    await userEvent.upload(fileInput, file);
    await userEvent.click(screen.getByRole("button", { name: /Verify Document/i }));

    expect(await screen.findAllByText("TAMPERING DETECTED")).toHaveLength(2);
    expectPresent(screen.getByText("0xmocktamper"));
  });
});
