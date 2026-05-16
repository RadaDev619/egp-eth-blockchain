"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ClipboardCheck, Loader2, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { LoadingButton } from "@/components/LoadingButton";
import { RoleBadge } from "@/components/RoleBadge";
import { TenderStateBadge } from "@/components/TenderStateBadge";
import { UnauthorizedAttemptAlert } from "@/components/UnauthorizedAttemptAlert";
import { useToast } from "@/components/ToastProvider";
import { useTenders } from "@/hooks/useTenders";
import { useSession } from "@/hooks/useSession";
import { committeeApi } from "@/services/apiClient";
import type { CommitteeDashboard } from "@/types/gateway";
import { nowHash } from "@/utils/demoHash";
import { blockedActionTitle, procurementErrorMessage } from "@/utils/errorMessages";

export default function CommitteePage() {
  const { user } = useSession();
  const { tenders, loading: tendersLoading } = useTenders(Boolean(user));
  const { notify } = useToast();
  const [tenderId, setTenderId] = useState("");
  const [dashboard, setDashboard] = useState<CommitteeDashboard | null>(null);
  const [technicalEnvelopeCount, setTechnicalEnvelopeCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [declaring, setDeclaring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canDeclare = user?.permissions.includes("DECLARE_CONFLICT_OF_INTEREST") ?? false;

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
      setTechnicalEnvelopeCount(null);
    } catch (loadError) {
      setError(procurementErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function declareNoConflict(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenderId) {
      setError("Select an assigned tender first.");
      return;
    }

    setDeclaring(true);
    setError(null);

    try {
      await committeeApi.declareConflict(tenderId, {
        declarationStatus: "DECLARED_NO_CONFLICT",
        declarationHash: nowHash(`coi:${tenderId}`)
      });
      notify({ type: "success", title: "Conflict declaration recorded", message: "Committee policy can now evaluate access." });
      await loadDashboard(tenderId);
    } catch (declareError) {
      const message = procurementErrorMessage(declareError);
      setError(message);
      notify({ type: "error", title: blockedActionTitle(declareError), message });
    } finally {
      setDeclaring(false);
    }
  }

  async function loadTechnicalEnvelopes() {
    if (!tenderId) {
      setError("Select an assigned tender first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await committeeApi.listTechnicalEnvelopes(tenderId);
      setTechnicalEnvelopeCount(response.envelopes.length);
      notify({ type: "success", title: "Technical envelopes loaded", message: "Financial envelopes remain outside this committee view." });
    } catch (loadError) {
      const message = procurementErrorMessage(loadError);
      setError(message);
      notify({ type: "error", title: blockedActionTitle(loadError), message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <section>
          <p className="text-sm font-semibold text-emerald-800">Committee Workspace</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Technical Evaluation Committee</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Committee access is tender-specific and blocked when conflict declaration policy is not satisfied.
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
              Load Committee
            </LoadingButton>
          </div>
        </section>

        {error ? <UnauthorizedAttemptAlert title="Committee action blocked" message={error} /> : null}

        {dashboard ? (
          <>
            <section className="grid gap-4 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-500">Tender</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{dashboard.tender.tenderCode}</p>
                <div className="mt-3">
                  <TenderStateBadge state={dashboard.tender.currentState} />
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-500">Your Declaration</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{dashboard.currentUser.declarationStatus}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-500">Technical Envelopes</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{technicalEnvelopeCount ?? dashboard.technicalEnvelopeCount}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-500">Reports</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{dashboard.reports.length}</p>
              </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-2">
              <form onSubmit={(event) => void declareNoConflict(event)} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-slate-600" aria-hidden="true" />
                  <h2 className="text-base font-semibold text-slate-950">Conflict Declaration</h2>
                </div>
                <p className="mt-2 text-sm text-slate-600">Submit a no-conflict declaration hash for this tender.</p>
                <div className="mt-5">
                  <LoadingButton type="submit" loading={declaring} disabled={!canDeclare}>
                    Declare No Conflict
                  </LoadingButton>
                </div>
              </form>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-600" aria-hidden="true" />
                  <h2 className="text-base font-semibold text-slate-950">Technical Access</h2>
                </div>
                <p className="mt-2 text-sm text-slate-600">Load technical envelope metadata for assigned committee members.</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <LoadingButton loading={loading} onClick={() => void loadTechnicalEnvelopes()}>
                    Load Technical Envelopes
                  </LoadingButton>
                  <Link
                    href="/committee/evaluation"
                    className="inline-flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  >
                    Evaluation Reports
                  </Link>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-950">Active Assignments</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {dashboard.assignments.map((assignment) => (
                  <article key={assignment.id} className="rounded-md border border-slate-200 p-3">
                    <RoleBadge role={assignment.role} />
                    <p className="mt-2 text-sm font-semibold text-slate-950">{assignment.stakeholder?.displayName ?? assignment.role}</p>
                    <p className="text-xs text-slate-500">{assignment.status}</p>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}

        {loading && !dashboard ? (
          <div className="flex min-h-72 items-center justify-center rounded-lg border border-slate-200 bg-white">
            <Loader2 className="h-7 w-7 animate-spin text-slate-500" aria-hidden="true" />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
