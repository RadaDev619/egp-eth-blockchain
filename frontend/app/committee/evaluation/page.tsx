"use client";

import { FormEvent, useState } from "react";
import { FileCheck2, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BlockchainProofCard } from "@/components/BlockchainProofCard";
import { LoadingButton } from "@/components/LoadingButton";
import { TenderStateBadge } from "@/components/TenderStateBadge";
import { UnauthorizedAttemptAlert } from "@/components/UnauthorizedAttemptAlert";
import { useToast } from "@/components/ToastProvider";
import { useSession } from "@/hooks/useSession";
import { useTenders } from "@/hooks/useTenders";
import { committeeApi } from "@/services/apiClient";
import type { CommitteeDashboard } from "@/types/gateway";
import { nowHash } from "@/utils/demoHash";
import { blockedActionTitle, procurementErrorMessage } from "@/utils/errorMessages";

export default function CommitteeEvaluationPage() {
  const { user } = useSession();
  const { tenders, loading: tendersLoading } = useTenders(Boolean(user));
  const { notify } = useToast();
  const [tenderId, setTenderId] = useState("");
  const [dashboard, setDashboard] = useState<CommitteeDashboard | null>(null);
  const [reportHash, setReportHash] = useState(nowHash("evaluation-report"));
  const [technicalScoreHash, setTechnicalScoreHash] = useState(nowHash("technical-score"));
  const [financialScoreHash, setFinancialScoreHash] = useState(nowHash("financial-score"));
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [finalizingReportId, setFinalizingReportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboard(nextTenderId = tenderId) {
    if (!nextTenderId) {
      setError("Select an assigned tender first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await committeeApi.getDashboard(nextTenderId);
      setDashboard(response.dashboard);
    } catch (loadError) {
      setError(procurementErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenderId) {
      setError("Select an assigned tender first.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await committeeApi.submitEvaluationReport(tenderId, {
        reportHash,
        technicalScoreHash,
        financialScoreHash
      });
      notify({ type: "success", title: "Evaluation report submitted", message: "Report hash is now available for chair finalization." });
      await loadDashboard(tenderId);
    } catch (submitError) {
      const message = procurementErrorMessage(submitError);
      setError(message);
      notify({ type: "error", title: blockedActionTitle(submitError), message });
    } finally {
      setSubmitting(false);
    }
  }

  async function finalizeReport(reportId: string) {
    if (!tenderId) {
      return;
    }

    setFinalizingReportId(reportId);
    setError(null);

    try {
      await committeeApi.finalizeEvaluationReport(tenderId, reportId);
      notify({ type: "success", title: "Evaluation finalized", message: "Tender can advance from technical to financial evaluation." });
      await loadDashboard(tenderId);
    } catch (finalizeError) {
      const message = procurementErrorMessage(finalizeError);
      setError(message);
      notify({ type: "error", title: blockedActionTitle(finalizeError), message });
    } finally {
      setFinalizingReportId(null);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <section>
          <p className="text-sm font-semibold text-emerald-800">Evaluation Reports</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Committee Reports And Votes</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Technical and financial committee members submit individual report hashes. The chair finalizes the combined evaluation before award voting.
          </p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-slate-800">Assigned Tender</span>
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
            <LoadingButton loading={loading || tendersLoading} onClick={() => void loadDashboard()}>
              Load Reports
            </LoadingButton>
          </div>
        </section>

        {error ? <UnauthorizedAttemptAlert title="Evaluation action blocked" message={error} /> : null}

        {dashboard ? (
          <>
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{dashboard.tender.tenderCode}</p>
                  <p className="mt-1 text-xs text-slate-600">{dashboard.reports.length} reports recorded</p>
                </div>
                <TenderStateBadge state={dashboard.tender.currentState} />
              </div>
            </section>

            <form onSubmit={(event) => void submitReport(event)} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-slate-600" aria-hidden="true" />
                <h2 className="text-base font-semibold text-slate-950">Submit Individual Report Hash</h2>
              </div>
              <div className="mt-4 grid gap-4">
                {[
                  ["Report Hash", reportHash, setReportHash],
                  ["Technical Score Hash", technicalScoreHash, setTechnicalScoreHash],
                  ["Financial Score Hash", financialScoreHash, setFinancialScoreHash]
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
                <LoadingButton type="submit" loading={submitting}>
                  Submit Report / Vote
                </LoadingButton>
              </div>
            </form>

            <section className="grid gap-4 lg:grid-cols-2">
              {dashboard.reports.map((report) => (
                <article key={report.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{report.status}</p>
                      <p className="mt-1 break-all text-xs text-slate-500">{report.reportHash}</p>
                    </div>
                    <LoadingButton loading={finalizingReportId === report.id} onClick={() => void finalizeReport(report.id)}>
                      Finalize
                    </LoadingButton>
                  </div>
                  <div className="mt-4">
                    <BlockchainProofCard txHash={report.txHash} status={report.blockchainStatus} compact />
                  </div>
                </article>
              ))}
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
