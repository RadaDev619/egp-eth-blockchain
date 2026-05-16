"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, FileSignature, Loader2, Send } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BlockchainProofCard } from "@/components/BlockchainProofCard";
import { LoadingButton } from "@/components/LoadingButton";
import { TenderStateBadge } from "@/components/TenderStateBadge";
import { UnauthorizedAttemptAlert } from "@/components/UnauthorizedAttemptAlert";
import { useToast } from "@/components/ToastProvider";
import { manifestApi } from "@/services/apiClient";
import type { ManifestStatusResponse } from "@/types/gateway";
import { nowHash } from "@/utils/demoHash";
import { blockedActionTitle, procurementErrorMessage } from "@/utils/errorMessages";

export default function TenderManifestPage() {
  const params = useParams<{ id: string }>();
  const tenderId = params.id;
  const { notify } = useToast();
  const [status, setStatus] = useState<ManifestStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signatureHash, setSignatureHash] = useState(nowHash("publication-signature"));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setStatus(await manifestApi.getStatus(tenderId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load tender manifest.");
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitAction(action: "request" | "approve", event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setBusyAction(action);
    setError(null);

    try {
      const next =
        action === "request"
          ? await manifestApi.requestPublication(tenderId, status?.manifest?.id)
          : await manifestApi.approvePublication(tenderId, {
              manifestId: status?.manifest?.id,
              signatureHash,
              comments: "Publication approved in secure gateway demo."
            });

      setStatus(next);
      notify({
        type: "success",
        title: action === "request" ? "Publication requested" : "Publication approval recorded",
        message: "The backend validated role, assignment, state, and hash policy."
      });
    } catch (actionError) {
      const message = procurementErrorMessage(actionError);
      setError(message);
      notify({ type: "error", title: blockedActionTitle(actionError), message });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <Link
          href={`/tenders/${tenderId}`}
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Tender
        </Link>

        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-800">Tender Manifest</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">{status?.tender.tenderCode ?? tenderId}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Publication moves only after threshold approval against the committed manifest hashes.
            </p>
          </div>
          {status?.tender.currentState ? <TenderStateBadge state={status.tender.currentState} /> : null}
        </section>

        {error ? <UnauthorizedAttemptAlert title="Manifest action blocked" message={error} /> : null}

        {loading ? (
          <div className="flex min-h-80 items-center justify-center rounded-lg border border-slate-200 bg-white">
            <Loader2 className="h-7 w-7 animate-spin text-slate-500" aria-hidden="true" />
          </div>
        ) : status?.manifest ? (
          <>
            <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <FileSignature className="h-4 w-4 text-slate-600" aria-hidden="true" />
                  <h2 className="text-base font-semibold text-slate-950">Committed Manifest</h2>
                </div>
                <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
                  <div>
                    <dt className="font-medium text-slate-500">Status</dt>
                    <dd className="mt-1 font-semibold text-slate-950">{status.manifest.status}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Threshold</dt>
                    <dd className="mt-1 font-semibold text-slate-950">
                      {status.approvedCount}/{status.publicationThreshold} approvals
                    </dd>
                  </div>
                  <div className="md:col-span-2">
                    <dt className="font-medium text-slate-500">Manifest Hash</dt>
                    <dd className="mt-1 break-all font-semibold text-slate-950">{status.manifest.manifestHash}</dd>
                  </div>
                  <div className="md:col-span-2">
                    <dt className="font-medium text-slate-500">Documents Hash</dt>
                    <dd className="mt-1 break-all font-semibold text-slate-950">{status.manifest.documentsHash ?? "Not provided"}</dd>
                  </div>
                </dl>
              </div>
              <BlockchainProofCard txHash={status.manifest.txHash} status={status.manifest.blockchainStatus} />
            </section>

            <section className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-slate-600" aria-hidden="true" />
                  <h2 className="text-base font-semibold text-slate-950">Request Publication</h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">Procurement Officer request counts as the first threshold approval.</p>
                <div className="mt-5">
                  <LoadingButton loading={busyAction === "request"} onClick={() => void submitAction("request")}>
                    Request Publication
                  </LoadingButton>
                </div>
              </div>

              <form onSubmit={(event) => void submitAction("approve", event)} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-slate-600" aria-hidden="true" />
                  <h2 className="text-base font-semibold text-slate-950">Approve Publication</h2>
                </div>
                <label className="mt-4 grid gap-2">
                  <span className="text-sm font-semibold text-slate-800">Signature Hash</span>
                  <input
                    value={signatureHash}
                    onChange={(event) => setSignatureHash(event.target.value)}
                    className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </label>
                <div className="mt-5">
                  <LoadingButton type="submit" loading={busyAction === "approve"}>
                    Approve Publication
                  </LoadingButton>
                </div>
              </form>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-950">Publication Approvals</h2>
              <div className="mt-4 space-y-3">
                {status.approvals.length === 0 ? (
                  <p className="text-sm text-slate-600">No publication approvals recorded.</p>
                ) : (
                  status.approvals.map((approval) => (
                    <article key={approval.id} className="rounded-md border border-slate-200 p-3">
                      <p className="text-sm font-semibold text-slate-950">{approval.approverRole}</p>
                      <p className="mt-1 text-xs text-slate-500">{approval.decision} - {approval.blockchainStatus}</p>
                    </article>
                  ))
                )}
              </div>
            </section>
          </>
        ) : (
          <UnauthorizedAttemptAlert title="No manifest found" message="This tender does not have a secure gateway manifest yet." />
        )}
      </div>
    </AppShell>
  );
}
