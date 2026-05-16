"use client";

import { useMemo, useState } from "react";
import { KeyRound, Loader2, LockKeyhole } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BlockchainProofCard } from "@/components/BlockchainProofCard";
import { LoadingButton } from "@/components/LoadingButton";
import { TenderStateBadge } from "@/components/TenderStateBadge";
import { UnauthorizedAttemptAlert } from "@/components/UnauthorizedAttemptAlert";
import { useToast } from "@/components/ToastProvider";
import { useSession } from "@/hooks/useSession";
import { useTenders } from "@/hooks/useTenders";
import { keyManagementApi, proposalApi } from "@/services/apiClient";
import type { FinancialWorkspace } from "@/types/gateway";
import type { KeyReleaseRequest, ProposalEnvelope, ProposalPackage } from "@/types/proposal";
import { blockedActionTitle, procurementErrorMessage } from "@/utils/errorMessages";

type EnvelopeRow = ProposalEnvelope & {
  proposalPackage: ProposalPackage;
};

function shortHash(value?: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return value.length > 22 ? `${value.slice(0, 12)}...${value.slice(-8)}` : value;
}

function collectEnvelopes(proposalPackages: ProposalPackage[]): EnvelopeRow[] {
  return proposalPackages.flatMap((proposalPackage) =>
    (proposalPackage.envelopes ?? []).map((envelope) => ({
      ...envelope,
      proposalPackage
    }))
  );
}

function collectRequests(envelopes: EnvelopeRow[]) {
  return envelopes.flatMap((envelope) => envelope.keyReleaseRequests ?? []);
}

export default function KmsRequestsPage() {
  const { user } = useSession();
  const { tenders, loading: tendersLoading } = useTenders(Boolean(user));
  const { notify } = useToast();
  const [tenderId, setTenderId] = useState("");
  const [proposalPackages, setProposalPackages] = useState<ProposalPackage[]>([]);
  const [financialWorkspace, setFinancialWorkspace] = useState<FinancialWorkspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestingEnvelopeId, setRequestingEnvelopeId] = useState<string | null>(null);
  const [releasingRequestId, setReleasingRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [financialNotice, setFinancialNotice] = useState<string | null>(null);

  const selectedTender = tenders.find((tender) => tender.id === tenderId) ?? null;
  const envelopes = useMemo(() => collectEnvelopes(proposalPackages), [proposalPackages]);
  const requests = useMemo(() => collectRequests(envelopes), [envelopes]);
  const canRequest = user?.permissions.includes("REQUEST_KEY_RELEASE") ?? false;
  const canRelease = user?.permissions.includes("RELEASE_ENVELOPE_KEY") ?? false;

  async function loadWorkspace(nextTenderId = tenderId) {
    if (!nextTenderId) {
      setError("Select a tender first.");
      return;
    }

    setLoading(true);
    setError(null);
    setFinancialNotice(null);

    try {
      const proposalsResponse = await proposalApi.listForTender(nextTenderId);
      setProposalPackages(proposalsResponse.proposalPackages);

      try {
        const financialResponse = await keyManagementApi.getFinancialWorkspace(nextTenderId);
        setFinancialWorkspace(financialResponse.workspace);
      } catch (financialError) {
        setFinancialWorkspace(null);
        setFinancialNotice(procurementErrorMessage(financialError));
      }
    } catch (loadError) {
      setProposalPackages([]);
      setFinancialWorkspace(null);
      setError(procurementErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function requestRelease(envelopeId: string) {
    setRequestingEnvelopeId(envelopeId);
    setError(null);

    try {
      await keyManagementApi.requestRelease(envelopeId);
      notify({
        type: "success",
        title: "Key release requested",
        message: "The backend checked role, tender state, and key policy before recording the request."
      });
      await loadWorkspace(tenderId);
    } catch (requestError) {
      const message = procurementErrorMessage(requestError);
      setError(message);
      notify({ type: "error", title: blockedActionTitle(requestError), message });
    } finally {
      setRequestingEnvelopeId(null);
    }
  }

  async function releaseKey(request: KeyReleaseRequest) {
    setReleasingRequestId(request.id);
    setError(null);

    try {
      await keyManagementApi.release(request.id);
      notify({
        type: "success",
        title: "Envelope key released",
        message: "Release evidence was recorded through the backend relayer."
      });
      await loadWorkspace(tenderId);
    } catch (releaseError) {
      const message = procurementErrorMessage(releaseError);
      setError(message);
      notify({ type: "error", title: blockedActionTitle(releaseError), message });
    } finally {
      setReleasingRequestId(null);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <section>
          <p className="text-sm font-semibold text-emerald-800">Key Custody</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Envelope Key Release Requests</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Encrypted proposal envelopes remain locked until the backend validates role, tender state, and release policy.
          </p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-slate-800">Tender</span>
              <select
                value={tenderId}
                onChange={(event) => setTenderId(event.target.value)}
                className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
              >
                <option value="">Select tender</option>
                {tenders.map((tender) => (
                  <option key={tender.id} value={tender.id}>
                    {tender.tenderCode} - {tender.currentState}
                  </option>
                ))}
              </select>
            </label>
            <LoadingButton loading={loading || tendersLoading} onClick={() => void loadWorkspace()}>
              Load Key Requests
            </LoadingButton>
          </div>
        </section>

        {error ? <UnauthorizedAttemptAlert title="Key release action blocked" message={error} /> : null}
        {financialNotice ? (
          <UnauthorizedAttemptAlert
            title="Financial envelope workspace locked"
            message={financialNotice}
            details={[{ label: "Expected Stage", value: "FINANCIAL_EVALUATION" }]}
          />
        ) : null}

        {selectedTender ? (
          <section className="grid gap-4 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">Tender</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{selectedTender.tenderCode}</p>
              <div className="mt-3">
                <TenderStateBadge state={selectedTender.currentState} />
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">Proposal Packages</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{proposalPackages.length}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">Encrypted Envelopes</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{envelopes.length}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">Visible Requests</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{requests.length}</p>
            </div>
          </section>
        ) : null}

        {loading ? (
          <div className="flex min-h-72 items-center justify-center rounded-lg border border-slate-200 bg-white">
            <Loader2 className="h-7 w-7 animate-spin text-slate-500" aria-hidden="true" />
          </div>
        ) : (
          <>
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <LockKeyhole className="h-4 w-4 text-slate-600" aria-hidden="true" />
                <h2 className="text-base font-semibold text-slate-950">Encrypted Envelopes</h2>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {envelopes.length === 0 ? (
                  <p className="text-sm text-slate-600">No proposal envelopes are available for this tender.</p>
                ) : (
                  envelopes.map((envelope) => (
                    <article key={envelope.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950">{envelope.envelopeType}</p>
                          <p className="mt-1 text-xs text-slate-500">Package {shortHash(envelope.proposalPackage.packageHash)}</p>
                          <p className="mt-2 break-all text-xs font-medium text-slate-700">{envelope.envelopeManifestHash}</p>
                        </div>
                        <LoadingButton
                          loading={requestingEnvelopeId === envelope.id}
                          disabled={!canRequest}
                          onClick={() => void requestRelease(envelope.id)}
                        >
                          Request
                        </LoadingButton>
                      </div>
                      <div className="mt-4">
                        <BlockchainProofCard txHash={envelope.txHash} status={envelope.blockchainStatus} compact />
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-slate-600" aria-hidden="true" />
                <h2 className="text-base font-semibold text-slate-950">Release Requests</h2>
              </div>
              <div className="mt-4 grid gap-3">
                {requests.length === 0 ? (
                  <p className="text-sm text-slate-600">No key release request is visible yet.</p>
                ) : (
                  requests.map((request) => (
                    <div key={request.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">{request.status}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {request.requesterRole} requested at {request.requestedTenderState}
                          </p>
                          {request.keyMaterialReference ? (
                            <p className="mt-2 break-all text-xs font-medium text-slate-700">{request.keyMaterialReference}</p>
                          ) : null}
                        </div>
                        <LoadingButton
                          loading={releasingRequestId === request.id}
                          disabled={!canRelease || request.status === "APPROVED" || request.status === "DENIED"}
                          onClick={() => void releaseKey(request)}
                        >
                          Release
                        </LoadingButton>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {financialWorkspace ? (
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-slate-950">Financial Evaluation Envelope View</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {financialWorkspace.envelopes.length} financial envelopes are available in the permitted evaluation stage.
                </p>
              </section>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
