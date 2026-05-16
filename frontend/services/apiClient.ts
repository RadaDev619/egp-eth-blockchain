import type { AuthenticatedUser, DemoNdiProfile, LoginResponse, NDIStartResponse } from "@/types/auth";
import type {
  AuditLogFilters,
  AuditLogsResponse,
  AuditTransactionProofResponse,
  DocumentVerificationResponse,
  PublicAuditFilters,
  PublicAuditOverviewResponse,
  PublicTenderAuditResponse,
  PublicTransactionAuditResponse,
  TenderAuditTimelineResponse,
  VerifyDocumentInput
} from "@/types/audit";
import type { ApprovalInput, CreateTenderInput, SubmitBidInput, Tender } from "@/types/procurement";
import type { ProposalPackage, UploadEncryptedEnvelopeInput } from "@/types/proposal";
import type {
  AwardApprovalResult,
  AwardWorkspace,
  CommitteeDashboard,
  FinancialWorkspace,
  KeyReleaseActionResult,
  LegacyEgpRecord,
  ManifestStatusResponse,
  SubmitProposalPackageInput
} from "@/types/gateway";

const CONFIGURED_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const TOKEN_KEY = "egp_trust_layer_session";

function apiBaseUrl() {
  if (typeof window === "undefined") {
    return CONFIGURED_API_BASE_URL;
  }

  try {
    const configuredUrl = new URL(CONFIGURED_API_BASE_URL);
    const pageHost = window.location.hostname;
    const configuredIsLoopback = configuredUrl.hostname === "localhost" || configuredUrl.hostname === "127.0.0.1";
    const pageIsLoopback = pageHost === "localhost" || pageHost === "127.0.0.1";

    if (configuredIsLoopback && !pageIsLoopback) {
      configuredUrl.hostname = pageHost;
      return configuredUrl.toString().replace(/\/$/, "");
    }
  } catch {
    return CONFIGURED_API_BASE_URL;
  }

  return CONFIGURED_API_BASE_URL;
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function sessionToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionToken();
  const headers = new Headers(init.headers);
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;

  if (!headers.has("content-type") && init.body && !isFormData) {
    headers.set("content-type", "application/json");
  }

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
  };

  if (!response.ok) {
    throw new ApiClientError(
      response.status,
      payload.error?.code ?? "API_ERROR",
      payload.error?.message ?? "The backend request failed."
    );
  }

  return payload as T;
}

export function saveSessionToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearSessionToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

export function hasSessionToken() {
  return Boolean(sessionToken());
}

export const authApi = {
  listDemoProfiles: () => request<{ profiles: DemoNdiProfile[] }>("/auth/demo-profiles"),
  startNdiLogin: () => request<NDIStartResponse>("/auth/ndi/start", { method: "POST" }),
  completeMockNdiLogin: (proofRequestThreadId: string, employmentId: string) =>
    request<LoginResponse>("/auth/ndi/mock-complete", {
      method: "POST",
      body: JSON.stringify({ proofRequestThreadId, employmentId })
    }),
  getMe: () => request<{ user: AuthenticatedUser }>("/auth/me"),
  logout: () => request<void>("/auth/logout", { method: "POST" })
};

function createTenderFormData(input: CreateTenderInput) {
  const formData = new FormData();
  formData.append("tenderCode", input.tenderCode);
  formData.append("agency", input.agency);
  formData.append("title", input.title);
  formData.append("description", input.description);

  if (input.document) {
    formData.append("document", input.document);
  } else if (input.documentHash) {
    formData.append("documentHash", input.documentHash);
  }

  return formData;
}

function auditQueryString(filters: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const query = params.toString();
  return query ? `?${query}` : "";
}

function verificationFormData(input: VerifyDocumentInput) {
  const formData = new FormData();
  formData.append("tenderId", input.tenderId);
  formData.append("document", input.document);

  if (input.versionNumber) {
    formData.append("versionNumber", String(input.versionNumber));
  }

  if (input.tenderVersionId) {
    formData.append("tenderVersionId", input.tenderVersionId);
  }

  return formData;
}

function encryptedEnvelopeFormData(input: UploadEncryptedEnvelopeInput) {
  const formData = new FormData();
  formData.append("envelopeType", input.envelopeType);
  formData.append("envelopeManifestHash", input.envelopeManifestHash);
  formData.append("encryptedFile", input.encryptedFile);

  if (input.keyId) {
    formData.append("keyId", input.keyId);
  }

  if (input.encryptionAlgorithm) {
    formData.append("encryptionAlgorithm", input.encryptionAlgorithm);
  }

  if (input.iv) {
    formData.append("iv", input.iv);
  }

  if (input.authTag) {
    formData.append("authTag", input.authTag);
  }

  if (input.ipfsCid) {
    formData.append("ipfsCid", input.ipfsCid);
  }

  return formData;
}

export const tenderApi = {
  list: () => request<{ tenders: Tender[] }>("/tenders"),
  get: (id: string) => request<{ tender: Tender }>(`/tenders/${id}`),
  create: (input: CreateTenderInput) =>
    request<{ tender: Tender }>("/tender/create", {
      method: "POST",
      body: createTenderFormData(input)
    })
};

export const bidApi = {
  submit: (input: SubmitBidInput) =>
    request<{ tender: Tender }>("/bid/submit", {
      method: "POST",
      body: JSON.stringify(input)
    })
};

export const approvalApi = {
  approveEvaluation: (input: ApprovalInput) =>
    request<{ tender: Tender }>("/approve/evaluation", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  approvePayment: (input: ApprovalInput) =>
    request<{ tender: Tender }>("/approve/payment", {
      method: "POST",
      body: JSON.stringify(input)
    })
};

export const auditApi = {
  listLogs: (filters?: AuditLogFilters) => request<AuditLogsResponse>(`/audit/logs${auditQueryString(filters)}`),
  getTenderTimeline: (tenderId: string) => request<TenderAuditTimelineResponse>(`/audit/tender/${encodeURIComponent(tenderId)}/timeline`),
  getTxProof: (txHash: string) => request<AuditTransactionProofResponse>(`/audit/tx/${encodeURIComponent(txHash)}`)
};

export const publicAuditApi = {
  list: (filters?: PublicAuditFilters) => request<PublicAuditOverviewResponse>(`/public/audit${auditQueryString(filters)}`),
  getTender: (tenderId: string) => request<PublicTenderAuditResponse>(`/public/audit/tenders/${encodeURIComponent(tenderId)}`),
  getTx: (txHash: string) => request<PublicTransactionAuditResponse>(`/public/audit/tx/${encodeURIComponent(txHash)}`)
};

export const verificationApi = {
  verifyDocument: (input: VerifyDocumentInput) =>
    request<DocumentVerificationResponse>("/verify/document", {
      method: "POST",
      body: verificationFormData(input)
    })
};

export const proposalApi = {
  listForTender: (tenderId: string) =>
    request<{ proposalPackages: ProposalPackage[] }>(`/gateway/tenders/${encodeURIComponent(tenderId)}/proposals`),
  getPackage: (proposalPackageId: string) =>
    request<{ proposalPackage: ProposalPackage }>(`/gateway/proposals/${encodeURIComponent(proposalPackageId)}`),
  submitPackage: (input: SubmitProposalPackageInput) =>
    request<{ proposalPackage: ProposalPackage; envelopes: unknown[] }>(`/gateway/tenders/${encodeURIComponent(input.tenderId)}/proposals`, {
      method: "POST",
      body: JSON.stringify({
        packageHash: input.packageHash,
        envelopes: input.envelopes
      })
    }),
  uploadEncryptedEnvelope: (input: UploadEncryptedEnvelopeInput) =>
    request<{ envelope: unknown }>(`/gateway/proposals/${encodeURIComponent(input.proposalPackageId)}/envelopes/upload`, {
      method: "POST",
      body: encryptedEnvelopeFormData(input)
    })
};

export const manifestApi = {
  getStatus: (tenderId: string) => request<ManifestStatusResponse>(`/gateway/tenders/${encodeURIComponent(tenderId)}/manifest`),
  create: (input: {
    tenderCode: string;
    agency: string;
    title: string;
    description: string;
    manifestHash: string;
    documentsHash?: string;
    rulesHash?: string;
    criteriaHash?: string;
    publicationThreshold?: number;
  }) =>
    request<ManifestStatusResponse>("/gateway/tenders/manifest", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  requestPublication: (tenderId: string, manifestId?: string) =>
    request<ManifestStatusResponse>(`/gateway/tenders/${encodeURIComponent(tenderId)}/publication/request`, {
      method: "POST",
      body: JSON.stringify({ manifestId })
    }),
  approvePublication: (tenderId: string, input: { manifestId?: string; signatureHash: string; comments?: string }) =>
    request<ManifestStatusResponse>(`/gateway/tenders/${encodeURIComponent(tenderId)}/publication/approve`, {
      method: "POST",
      body: JSON.stringify(input)
    })
};

export const committeeApi = {
  getDashboard: (tenderId: string) =>
    request<{ dashboard: CommitteeDashboard }>(`/gateway/tenders/${encodeURIComponent(tenderId)}/committee`),
  declareConflict: (tenderId: string, input: { declarationStatus: string; declarationHash: string }) =>
    request<{ declaration: unknown }>(`/gateway/tenders/${encodeURIComponent(tenderId)}/committee/conflict-declarations`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  listTechnicalEnvelopes: (tenderId: string) =>
    request<{ envelopes: unknown[] }>(`/gateway/tenders/${encodeURIComponent(tenderId)}/committee/technical-envelopes`),
  submitEvaluationReport: (
    tenderId: string,
    input: { reportHash: string; technicalScoreHash?: string; financialScoreHash?: string }
  ) =>
    request<{ report: unknown }>(`/gateway/tenders/${encodeURIComponent(tenderId)}/committee/evaluation-reports`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  finalizeEvaluationReport: (tenderId: string, reportId: string) =>
    request<{ report: unknown }>(
      `/gateway/tenders/${encodeURIComponent(tenderId)}/committee/evaluation-reports/${encodeURIComponent(reportId)}/finalize`,
      { method: "POST" }
    )
};

export const awardApi = {
  getWorkspace: (tenderId: string) => request<{ workspace: AwardWorkspace }>(`/gateway/tenders/${encodeURIComponent(tenderId)}/award`),
  submitRecommendation: (tenderId: string, input: { evaluationReportId?: string; recommendedVendorStakeholderId?: string; recommendationHash: string }) =>
    request<{ recommendation: unknown }>(`/gateway/tenders/${encodeURIComponent(tenderId)}/award/recommendations`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  approve: (tenderId: string, awardRecommendationId: string, input: { signatureHash: string; comments?: string }) =>
    request<AwardApprovalResult>(
      `/gateway/tenders/${encodeURIComponent(tenderId)}/award/recommendations/${encodeURIComponent(awardRecommendationId)}/approvals`,
      {
        method: "POST",
        body: JSON.stringify(input)
      }
    ),
  commitContractProofs: (
    tenderId: string,
    input: { letterOfIntentHash?: string; letterOfAcceptanceHash?: string; contractHash?: string }
  ) =>
    request<{ tenderId: string; proofs: unknown[] }>(`/gateway/tenders/${encodeURIComponent(tenderId)}/award/contract-proofs`, {
      method: "POST",
      body: JSON.stringify(input)
    })
};

export const keyManagementApi = {
  requestRelease: (proposalEnvelopeId: string) =>
    request<KeyReleaseActionResult>(`/gateway/proposal-envelopes/${encodeURIComponent(proposalEnvelopeId)}/key-release/request`, {
      method: "POST"
    }),
  release: (keyReleaseRequestId: string) =>
    request<KeyReleaseActionResult>(`/gateway/key-release-requests/${encodeURIComponent(keyReleaseRequestId)}/release`, {
      method: "POST"
    }),
  getFinancialWorkspace: (tenderId: string) =>
    request<{ workspace: FinancialWorkspace }>(`/gateway/tenders/${encodeURIComponent(tenderId)}/financial-evaluation`),
  requestFinancialRelease: (tenderId: string, proposalEnvelopeId: string) =>
    request<KeyReleaseActionResult>(
      `/gateway/tenders/${encodeURIComponent(tenderId)}/financial-evaluation/envelopes/${encodeURIComponent(proposalEnvelopeId)}/key-release/request`,
      { method: "POST" }
    ),
  releaseFinancial: (tenderId: string, keyReleaseRequestId: string) =>
    request<KeyReleaseActionResult>(
      `/gateway/tenders/${encodeURIComponent(tenderId)}/financial-evaluation/key-release-requests/${encodeURIComponent(keyReleaseRequestId)}/release`,
      { method: "POST" }
    )
};

export const legacyEgpApi = {
  listRecords: (filters?: { tenderId?: string; recordType?: string; trustLayerTxHash?: string }) =>
    request<{ records: LegacyEgpRecord[] }>(`/gateway/legacy-egp/records${auditQueryString(filters)}`)
};
