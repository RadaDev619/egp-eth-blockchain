import type { AuthenticatedUser, DemoNdiProfile, LoginResponse, NDIStartResponse } from "@/types/auth";
import type {
  AuditLogFilters,
  AuditLogsResponse,
  AuditTransactionProofResponse,
  DocumentVerificationResponse,
  TenderAuditTimelineResponse,
  VerifyDocumentInput
} from "@/types/audit";
import type { ApprovalInput, CreateTenderInput, SubmitBidInput, Tender } from "@/types/procurement";

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

function auditQueryString(filters: AuditLogFilters = {}) {
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

export const verificationApi = {
  verifyDocument: (input: VerifyDocumentInput) =>
    request<DocumentVerificationResponse>("/verify/document", {
      method: "POST",
      body: verificationFormData(input)
    })
};
