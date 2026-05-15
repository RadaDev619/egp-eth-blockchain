import { expect, test, type Page } from "@playwright/test";

type DemoUser = {
  userId: string;
  holderDID: string;
  employmentId: string;
  employeeHash: string;
  employer: string;
  position: string;
  employmentType: string;
  role: string;
  permissions: string[];
};

type DemoTender = {
  id: string;
  tenderCode: string;
  agency: string;
  currentState: string;
  currentVersion: number;
  createdByEmployeeHash: string;
  createdByRole: string;
  createdTxHash: string;
  createdAt: string;
  updatedAt: string;
  versions: Array<Record<string, unknown>>;
  approvals: Array<Record<string, unknown>>;
};

const users: Record<string, DemoUser> = {
  "PROC-001": {
    userId: "proc-user",
    holderDID: "did:key:proc",
    employmentId: "PROC-001",
    employeeHash: "0xprocurement000000000000000000000000000000000000000000000000000000",
    employer: "Ministry of Finance",
    position: "Procurement Officer",
    employmentType: "Regular",
    role: "PROCUREMENT_OFFICER",
    permissions: ["CREATE_TENDER", "CREATE_TENDER_VERSION", "CANCEL_TENDER"]
  },
  "VEND-001": {
    userId: "vendor-user",
    holderDID: "did:key:vendor",
    employmentId: "VEND-001",
    employeeHash: "0xvendor000000000000000000000000000000000000000000000000000000000",
    employer: "Demo Vendor Pvt Ltd",
    position: "Vendor Representative",
    employmentType: "Regular",
    role: "VENDOR",
    permissions: ["SUBMIT_BID", "VIEW_ELIGIBLE_TENDERS"]
  },
  "EVAL-001": {
    userId: "eval-user",
    holderDID: "did:key:eval",
    employmentId: "EVAL-001",
    employeeHash: "0xevaluator000000000000000000000000000000000000000000000000000000",
    employer: "Evaluation Committee",
    position: "Technical Evaluator",
    employmentType: "Regular",
    role: "EVALUATOR",
    permissions: ["APPROVE_EVALUATION", "VIEW_ASSIGNED_TENDERS"]
  },
  "FIN-001": {
    userId: "finance-user",
    holderDID: "did:key:finance",
    employmentId: "FIN-001",
    employeeHash: "0xfinance0000000000000000000000000000000000000000000000000000000",
    employer: "Ministry of Finance",
    position: "Finance Officer",
    employmentType: "Regular",
    role: "FINANCE_OFFICER",
    permissions: ["APPROVE_PAYMENT", "VIEW_FINANCE_QUEUE"]
  },
  "AUD-001": {
    userId: "auditor-user",
    holderDID: "did:key:auditor",
    employmentId: "AUD-001",
    employeeHash: "0xauditor0000000000000000000000000000000000000000000000000000000",
    employer: "Royal Audit Authority",
    position: "Auditor",
    employmentType: "Regular",
    role: "AUDITOR",
    permissions: ["VIEW_AUDIT_LOGS", "VERIFY_DOCUMENT", "VIEW_BLOCKCHAIN_PROOFS"]
  }
};

const demoProfiles = Object.values(users).map(({ employmentId, employer, position, employmentType, role }) => ({
  employmentId,
  employer,
  position,
  employmentType,
  role
}));

function auditEvent(input: Partial<Record<string, unknown>> & { action: string; status: string }) {
  return {
    id: `audit-${input.action}-${Date.now()}-${Math.random()}`,
    actorRole: null,
    employeeHash: null,
    tenderId: "tender-1",
    fromState: null,
    toState: null,
    rejectionReason: null,
    txHash: null,
    blockchainStatus: null,
    timestamp: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...input
  };
}

async function installMockApi(page: Page) {
  let tender: DemoTender | null = null;
  const timeline: Array<Record<string, unknown>> = [];

  await page.route("**/auth/demo-profiles", async (route) => {
    await route.fulfill({ json: { profiles: demoProfiles } });
  });

  await page.route("**/auth/ndi/start", async (route) => {
    await route.fulfill({
      json: {
        mode: "mock",
        proofRequestThreadId: "mock-thread-e2e",
        threadId: "mock-thread-e2e",
        proofRequestURL: "https://mock.ndi/proof",
        proofRequestUrl: "https://mock.ndi/proof",
        deepLinkURL: "bhutan-ndi://mock",
        deepLinkUrl: "bhutan-ndi://mock",
        qrData: "mock",
        requestedAttributes: ["Employment ID", "Position", "Employment Type", "Employer"],
        demoProfiles
      }
    });
  });

  await page.route("**/auth/ndi/mock-complete", async (route) => {
    const body = route.request().postDataJSON() as { employmentId: string };
    const user = users[body.employmentId];
    await route.fulfill({
      json: {
        token: body.employmentId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        proof: {
          proofRequestThreadId: "mock-thread-e2e",
          verificationResult: "ProofValidated",
          status: "ProofValidated",
          requestedAttributes: ["Employment ID", "Position", "Employment Type", "Employer"],
          revealedAttributeNames: ["Employment ID", "Position", "Employment Type", "Employer"]
        },
        user,
        role: user.role,
        permissions: user.permissions,
        employeeHash: user.employeeHash
      }
    });
  });

  await page.route("**/auth/me", async (route) => {
    const token = route.request().headers().authorization?.replace("Bearer ", "") ?? "";
    const user = users[token];
    await route.fulfill({ status: user ? 200 : 401, json: user ? { user } : { error: { code: "UNAUTHENTICATED" } } });
  });

  await page.route("**/auth/logout", async (route) => {
    await route.fulfill({ status: 204 });
  });

  await page.route("http://localhost:4000/tenders", async (route) => {
    await route.fulfill({ json: { tenders: tender ? [tender] : [] } });
  });

  await page.route("**/tender/create", async (route) => {
    tender = {
      id: "tender-1",
      tenderCode: "TDR-E2E-001",
      agency: "Ministry of Finance",
      currentState: "CREATED",
      currentVersion: 1,
      createdByEmployeeHash: users["PROC-001"].employeeHash,
      createdByRole: "PROCUREMENT_OFFICER",
      createdTxHash: "0xmockcreate",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      versions: [
        {
          id: "version-1",
          tenderId: "tender-1",
          versionNumber: 1,
          title: "Bridge Maintenance",
          description: "Demo tender",
          documentHash: "0xdocumenthash",
          ipfsCid: "mock-cid-v1",
          createdByEmployeeHash: users["PROC-001"].employeeHash,
          createdByRole: "PROCUREMENT_OFFICER",
          txHash: "0xmockcreate",
          createdAt: new Date().toISOString()
        }
      ],
      approvals: []
    };
    timeline.push(
      auditEvent({
        action: "TENDER_CREATED",
        status: "MOCK_CHAIN_CONFIRMED",
        actorRole: "PROCUREMENT_OFFICER",
        employeeHash: users["PROC-001"].employeeHash,
        toState: "CREATED",
        txHash: "0xmockcreate",
        blockchainStatus: "MOCK_CONFIRMED"
      })
    );
    await route.fulfill({ status: 201, json: { tender } });
  });

  await page.route("**/bid/submit", async (route) => {
    if (tender) {
      tender.currentState = "BID_SUBMITTED";
      tender.updatedAt = new Date().toISOString();
    }
    timeline.push(
      auditEvent({
        action: "BID_SUBMITTED",
        status: "MOCK_CHAIN_CONFIRMED",
        actorRole: "VENDOR",
        employeeHash: users["VEND-001"].employeeHash,
        fromState: "CREATED",
        toState: "BID_SUBMITTED",
        txHash: "0xmockbid",
        blockchainStatus: "MOCK_CONFIRMED"
      })
    );
    await route.fulfill({ status: 201, json: { tender } });
  });

  await page.route("**/approve/evaluation", async (route) => {
    if (tender) {
      tender.currentState = "EVALUATION_APPROVED";
      tender.updatedAt = new Date().toISOString();
      tender.approvals.push({
        id: "approval-evaluation",
        tenderId: tender.id,
        approvalType: "EVALUATION",
        decision: "APPROVED",
        actorEmployeeHash: users["EVAL-001"].employeeHash,
        actorRole: "EVALUATOR",
        previousState: "BID_SUBMITTED",
        newState: "EVALUATION_APPROVED",
        txHash: "0xmockevaluation",
        blockchainStatus: "MOCK_CONFIRMED",
        createdAt: new Date().toISOString()
      });
    }
    timeline.push(
      auditEvent({
        action: "EVALUATION_APPROVED",
        status: "MOCK_CHAIN_CONFIRMED",
        actorRole: "EVALUATOR",
        employeeHash: users["EVAL-001"].employeeHash,
        fromState: "BID_SUBMITTED",
        toState: "EVALUATION_APPROVED",
        txHash: "0xmockevaluation",
        blockchainStatus: "MOCK_CONFIRMED"
      })
    );
    await route.fulfill({ json: { tender } });
  });

  await page.route("**/approve/payment", async (route) => {
    const token = route.request().headers().authorization?.replace("Bearer ", "") ?? "";

    if (token === "VEND-001") {
      timeline.push(
        auditEvent({
          action: "UNAUTHORIZED_ACTION_ATTEMPTED",
          status: "BLOCKED",
          actorRole: "VENDOR",
          employeeHash: users["VEND-001"].employeeHash,
          fromState: tender?.currentState ?? "UNKNOWN",
          permissionChecked: "APPROVE_PAYMENT",
          permissionResult: "DENIED",
          rejectionReason: "PERMISSION_MISSING"
        })
      );
      await route.fulfill({ status: 403, json: { error: { code: "AUTHORIZATION_ERROR", message: "Role cannot approve payment." } } });
      return;
    }

    if (tender?.currentState !== "EVALUATION_APPROVED") {
      timeline.push(
        auditEvent({
          action: "INVALID_TRANSITION_ATTEMPTED",
          status: "BLOCKED",
          actorRole: "FINANCE_OFFICER",
          employeeHash: users["FIN-001"].employeeHash,
          fromState: tender?.currentState ?? "UNKNOWN",
          rejectionReason: "EVALUATION_REQUIRED_BEFORE_PAYMENT"
        })
      );
      await route.fulfill({ status: 409, json: { error: { code: "INVALID_TRANSITION", message: "Evaluation approval is required." } } });
      return;
    }

    tender.currentState = "PAYMENT_APPROVED";
    tender.updatedAt = new Date().toISOString();
    tender.approvals.push({
      id: "approval-payment",
      tenderId: tender.id,
      approvalType: "PAYMENT",
      decision: "APPROVED",
      actorEmployeeHash: users["FIN-001"].employeeHash,
      actorRole: "FINANCE_OFFICER",
      previousState: "EVALUATION_APPROVED",
      newState: "PAYMENT_APPROVED",
      txHash: "0xmockpayment",
      blockchainStatus: "MOCK_CONFIRMED",
      createdAt: new Date().toISOString()
    });
    timeline.push(
      auditEvent({
        action: "PAYMENT_APPROVED",
        status: "MOCK_CHAIN_CONFIRMED",
        actorRole: "FINANCE_OFFICER",
        employeeHash: users["FIN-001"].employeeHash,
        fromState: "EVALUATION_APPROVED",
        toState: "PAYMENT_APPROVED",
        txHash: "0xmockpayment",
        blockchainStatus: "MOCK_CONFIRMED"
      })
    );
    await route.fulfill({ json: { tender } });
  });

  await page.route("**/audit/logs**", async (route) => {
    await route.fulfill({ json: { timeline, logs: timeline } });
  });

  await page.route("**/verify/document", async (route) => {
    timeline.push(
      auditEvent({
        action: "DOCUMENT_VERIFICATION_FAILED",
        status: "FAILED",
        actorRole: "AUDITOR",
        employeeHash: users["AUD-001"].employeeHash,
        documentHash: "0xuploadedhash",
        txHash: null,
        blockchainStatus: null
      }),
      auditEvent({
        action: "TAMPERING_DETECTED",
        status: "MOCK_CHAIN_CONFIRMED",
        actorRole: "AUDITOR",
        employeeHash: users["AUD-001"].employeeHash,
        documentHash: "0xuploadedhash",
        txHash: "0xmocktamper",
        blockchainStatus: "MOCK_CONFIRMED"
      })
    );
    await route.fulfill({
      json: {
        verified: false,
        tamperingDetected: true,
        tenderId: "tender-1",
        tenderVersionId: "version-1",
        versionNumber: 1,
        expectedDocumentHash: "0xdocumenthash",
        uploadedDocumentHash: "0xuploadedhash",
        ipfsCid: "mock-cid-v1",
        txHash: "0xmocktamper",
        blockchainStatus: "MOCK_CONFIRMED"
      }
    });
  });
}

async function loginAs(page: Page, profileText: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(profileText) }).click();
  await page.getByRole("button", { name: /Continue/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("golden demo flow from mock NDI login to auditor timeline", async ({ page }) => {
  await installMockApi(page);

  await loginAs(page, "Procurement Officer");
  await page.goto("/tenders/create");
  await page.getByLabel("Tender Code").fill("TDR-E2E-001");
  await page.getByLabel("Title").fill("Bridge Maintenance");
  await page.getByLabel("Description").fill("Demo bridge maintenance tender");
  await page.getByRole("button", { name: /^Create Tender$/i }).click();
  await expect(page).toHaveURL(/\/tenders/);
  await expect(page.getByText("Bridge Maintenance")).toBeVisible();
  await expect(page.getByText(/^Created$/)).toBeVisible();
  await expect(page.getByText("0xmockcreate").first()).toBeVisible();

  await loginAs(page, "Vendor Representative");
  await page.goto("/bids");
  await page.getByRole("button", { name: /Submit Bid/i }).click();
  await expect(page.getByText("Bid submitted", { exact: true })).toBeVisible();
  await page.goto("/tenders");
  await expect(page.getByText(/^Bid Submitted$/)).toBeVisible();

  await loginAs(page, "Finance Officer");
  await page.goto("/approvals");
  await page.getByRole("button", { name: /Attempt for Demo Audit/i }).click();
  await expect(page.getByText("Approval action blocked")).toBeVisible();

  await loginAs(page, "Technical Evaluator");
  await page.goto("/approvals");
  await page.getByRole("button", { name: /^Submit Approval$/i }).click();
  await expect(page.getByText("Evaluation approved", { exact: true })).toBeVisible();
  await page.goto("/tenders");
  await expect(page.getByText(/^Evaluation Approved$/)).toBeVisible();

  await loginAs(page, "Finance Officer");
  await page.goto("/approvals");
  await page.getByRole("button", { name: /^Submit Approval$/i }).click();
  await expect(page.getByText("Payment approved", { exact: true })).toBeVisible();
  await page.goto("/tenders");
  await expect(page.getByText(/^Payment Approved$/)).toBeVisible();

  await loginAs(page, "Vendor Representative");
  await page.goto("/approvals");
  await expect(page.getByText("Approval actions hidden")).toBeVisible();
  await page.evaluate(async () => {
    await fetch("http://localhost:4000/approve/payment", {
      method: "POST",
      headers: {
        authorization: "Bearer VEND-001",
        "content-type": "application/json"
      },
      body: JSON.stringify({ tenderId: "tender-1" })
    });
  });

  await loginAs(page, "Auditor");
  await page.goto("/audit");
  await expect(page.getByText("Tender Created")).toBeVisible();
  await expect(page.getByText("Invalid Transition Attempted")).toBeVisible();
  await expect(page.getByText("Unauthorized Action Attempted")).toBeVisible();
  await expect(page.getByText("Payment Approved")).toBeVisible();
  await expect(page.locator('span[title="Finance Officer"]').first()).toBeVisible();
  await expect(page.getByText("0xfinance000...00000000").first()).toBeVisible();
  await expect(page.getByText("0xmockpayment").first()).toBeVisible();

  await page.goto("/verify");
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("document-upload-input").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "modified.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nmodified demo document")
  });
  await expect(page.getByRole("button", { name: /Verify Document/i })).toBeEnabled();
  await page.getByRole("button", { name: /Verify Document/i }).click();
  await expect(page.getByText("TAMPERING DETECTED").first()).toBeVisible();
  await expect(page.getByText("0xmocktamper").first()).toBeVisible();
});
