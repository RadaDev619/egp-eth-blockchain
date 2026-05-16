"use client";

import { FormEvent, useMemo, useState } from "react";
import { Award, FileSignature, Loader2, ScrollText } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BlockchainProofCard } from "@/components/BlockchainProofCard";
import { LoadingButton } from "@/components/LoadingButton";
import { TenderStateBadge } from "@/components/TenderStateBadge";
import { UnauthorizedAttemptAlert } from "@/components/UnauthorizedAttemptAlert";
import { useToast } from "@/components/ToastProvider";
import { useSession } from "@/hooks/useSession";
import { useTenders } from "@/hooks/useTenders";
import { awardApi } from "@/services/apiClient";
import type { AwardRecommendation, AwardWorkspace } from "@/types/gateway";
import { nowHash } from "@/utils/demoHash";
import { blockedActionTitle, procurementErrorMessage } from "@/utils/errorMessages";

function shortHash(value?: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return value.length > 22 ? `${value.slice(0, 12)}...${value.slice(-8)}` : value;
}

export default function AwardPage() {
  const { user } = useSession();
  const { tenders, loading: tendersLoading } = useTenders(Boolean(user));
  const { notify } = useToast();
  const [tenderId, setTenderId] = useState("");
  const [workspace, setWorkspace] = useState<AwardWorkspace | null>(null);
  const [recommendationHash, setRecommendationHash] = useState(nowHash("award-recommendation"));
  const [evaluationReportId, setEvaluationReportId] = useState("");
  const [signatureHash, setSignatureHash] = useState(nowHash("award-approval-signature"));
  const [comments, setComments] = useState("Threshold approval recorded for demo award package.");
  const [letterOfIntentHash, setLetterOfIntentHash] = useState(nowHash("letter-of-intent"));
  const [letterOfAcceptanceHash, setLetterOfAcceptanceHash] = useState(nowHash("letter-of-acceptance"));
  const [contractHash, setContractHash] = useState(nowHash("contract-hash"));
  const [selectedRecommendationId, setSelectedRecommendationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [submittingRecommendation, setSubmittingRecommendation] = useState(false);
  const [approving, setApproving] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestRecommendation = useMemo(() => workspace?.recommendations[0] ?? null, [workspace]);
  const recommendationForApproval = selectedRecommendationId || latestRecommendation?.id || "";
  const canRecommend = user?.permissions.includes("SUBMIT_AWARD_RECOMMENDATION") ?? false;
  const canApprove = user?.permissions.includes("APPROVE_AWARD") ?? false;
  const canCommitContract = user?.permissions.includes("COMMIT_CONTRACT_HASH") ?? false;

  async function loadWorkspace(nextTenderId = tenderId) {
    if (!nextTenderId) {
      setError("Select a tender first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await awardApi.getWorkspace(nextTenderId);
      setWorkspace(response.workspace);
      setSelectedRecommendationId(response.workspace.recommendations[0]?.id ?? "");
    } catch (loadError) {
      setWorkspace(null);
      setError(procurementErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function submitRecommendation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!tenderId) {
      setError("Select a tender first.");
      return;
    }

    setSubmittingRecommendation(true);
    setError(null);

    try {
      await awardApi.submitRecommendation(tenderId, {
        evaluationReportId: evaluationReportId.trim() || undefined,
        recommendationHash
      });
      notify({
        type: "success",
        title: "Award recommendation submitted",
        message: "The recommendation hash was recorded through the backend relayer."
      });
      await loadWorkspace(tenderId);
    } catch (submitError) {
      const message = procurementErrorMessage(submitError);
      setError(message);
      notify({ type: "error", title: blockedActionTitle(submitError), message });
    } finally {
      setSubmittingRecommendation(false);
    }
  }

  async function approveRecommendation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!tenderId || !recommendationForApproval) {
      setError("Load an award recommendation before approval.");
      return;
    }

    setApproving(true);
    setError(null);

    try {
      const result = await awardApi.approve(tenderId, recommendationForApproval, {
        signatureHash,
        comments: comments.trim() || undefined
      });
      notify({
        type: "success",
        title: result.thresholdMet ? "Award threshold met" : "Award approval recorded",
        message: `${result.approvedCount}/${result.threshold} approval proofs are recorded.`
      });
      await loadWorkspace(tenderId);
    } catch (approveError) {
      const message = procurementErrorMessage(approveError);
      setError(message);
      notify({ type: "error", title: blockedActionTitle(approveError), message });
    } finally {
      setApproving(false);
    }
  }

  async function commitProofs(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!tenderId) {
      setError("Select a tender first.");
      return;
    }

    setCommitting(true);
    setError(null);

    try {
      await awardApi.commitContractProofs(tenderId, {
        letterOfIntentHash: letterOfIntentHash.trim() || undefined,
        letterOfAcceptanceHash: letterOfAcceptanceHash.trim() || undefined,
        contractHash: contractHash.trim() || undefined
      });
      notify({
        type: "success",
        title: "Contract proofs committed",
        message: "Public audit proofs now include LOI, LOA, or contract hash commitments."
      });
      await loadWorkspace(tenderId);
    } catch (commitError) {
      const message = procurementErrorMessage(commitError);
      setError(message);
      notify({ type: "error", title: blockedActionTitle(commitError), message });
    } finally {
      setCommitting(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <section>
          <p className="text-sm font-semibold text-emerald-800">Award Control</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Award Team Voting</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            The committee recommendation is sent to three award-team members. Each member records an individual vote hash before the winner is approved.
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
              Load Award Workspace
            </LoadingButton>
          </div>
        </section>

        {error ? <UnauthorizedAttemptAlert title="Award action blocked" message={error} /> : null}

        {workspace ? (
          <>
            <section className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-500">Tender</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{workspace.tender.tenderCode}</p>
                <div className="mt-3">
                  <TenderStateBadge state={workspace.tender.currentState} />
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-500">Award Threshold</p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">{workspace.awardApprovalThreshold}</p>
                <p className="mt-1 text-xs text-slate-600">Individual award-team votes required before winner declaration.</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-500">Public Contract Proofs</p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">{workspace.contractProofs.length}</p>
                <p className="mt-1 text-xs text-slate-600">Visible on the public proof trail.</p>
              </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-3">
              <form onSubmit={(event) => void submitRecommendation(event)} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-slate-600" aria-hidden="true" />
                  <h2 className="text-base font-semibold text-slate-950">Submit Recommendation</h2>
                </div>
                <div className="mt-4 grid gap-4">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-slate-800">Evaluation Report ID</span>
                    <input
                      value={evaluationReportId}
                      onChange={(event) => setEvaluationReportId(event.target.value)}
                      placeholder="Optional: latest finalized report is used when blank"
                      className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-slate-800">Recommendation Hash</span>
                    <input
                      value={recommendationHash}
                      onChange={(event) => setRecommendationHash(event.target.value)}
                      className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                  </label>
                </div>
                <div className="mt-5 flex justify-end">
                  <LoadingButton type="submit" loading={submittingRecommendation} disabled={!canRecommend}>
                    Submit
                  </LoadingButton>
                </div>
              </form>

              <form onSubmit={(event) => void approveRecommendation(event)} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <FileSignature className="h-4 w-4 text-slate-600" aria-hidden="true" />
                  <h2 className="text-base font-semibold text-slate-950">Vote On Recommendation</h2>
                </div>
                <div className="mt-4 grid gap-4">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-slate-800">Recommendation</span>
                    <select
                      value={recommendationForApproval}
                      onChange={(event) => setSelectedRecommendationId(event.target.value)}
                      className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    >
                      <option value="">Select recommendation</option>
                      {workspace.recommendations.map((recommendation) => (
                        <option key={recommendation.id} value={recommendation.id}>
                          {recommendation.status} - {shortHash(recommendation.recommendationHash)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-slate-800">Vote Signature Hash</span>
                    <input
                      value={signatureHash}
                      onChange={(event) => setSignatureHash(event.target.value)}
                      className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-slate-800">Comments</span>
                    <textarea
                      value={comments}
                      onChange={(event) => setComments(event.target.value)}
                      rows={3}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                  </label>
                </div>
                <div className="mt-5 flex justify-end">
                  <LoadingButton type="submit" loading={approving} disabled={!canApprove || !recommendationForApproval}>
                    Record Vote
                  </LoadingButton>
                </div>
              </form>

              <form onSubmit={(event) => void commitProofs(event)} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <ScrollText className="h-4 w-4 text-slate-600" aria-hidden="true" />
                  <h2 className="text-base font-semibold text-slate-950">Commit Contract Proofs</h2>
                </div>
                <div className="mt-4 grid gap-4">
                  {[
                    ["Letter Of Intent Hash", letterOfIntentHash, setLetterOfIntentHash],
                    ["Letter Of Acceptance Hash", letterOfAcceptanceHash, setLetterOfAcceptanceHash],
                    ["Contract Hash", contractHash, setContractHash]
                  ].map(([label, value, setter]) => (
                    <label key={label as string} className="grid gap-2">
                      <span className="text-sm font-semibold text-slate-800">{label as string}</span>
                      <input
                        value={value as string}
                        onChange={(event) => (setter as (value: string) => void)(event.target.value)}
                        className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-5 flex justify-end">
                  <LoadingButton type="submit" loading={committing} disabled={!canCommitContract}>
                    Commit Proofs
                  </LoadingButton>
                </div>
              </form>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              {workspace.recommendations.map((recommendation: AwardRecommendation) => (
                <article key={recommendation.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{recommendation.status}</p>
                      <p className="mt-1 break-all text-xs text-slate-500">{recommendation.recommendationHash}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {recommendation.approvals?.length ?? 0}/{workspace.awardApprovalThreshold}
                    </span>
                  </div>
                  <div className="mt-4">
                    <BlockchainProofCard txHash={recommendation.txHash} status={recommendation.blockchainStatus} compact />
                  </div>
                </article>
              ))}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-950">Committed Contract Proofs</h2>
              <div className="mt-4 grid gap-3">
                {workspace.contractProofs.length === 0 ? (
                  <p className="text-sm text-slate-600">No LOI, LOA, or contract proof has been committed yet.</p>
                ) : (
                  workspace.contractProofs.map((proof) => (
                    <div key={proof.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">{proof.publicLabel}</p>
                          <p className="mt-1 break-all text-xs text-slate-500">{proof.proofHash}</p>
                        </div>
                        <span className="text-xs font-semibold text-slate-700">{proof.blockchainStatus ?? "NOT_SUBMITTED"}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        ) : loading ? (
          <div className="flex min-h-72 items-center justify-center rounded-lg border border-slate-200 bg-white">
            <Loader2 className="h-7 w-7 animate-spin text-slate-500" aria-hidden="true" />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
