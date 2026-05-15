"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Filter, Loader2, RefreshCw, ScrollText, ShieldAlert, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AuditEventTimeline } from "@/components/AuditEventTimeline";
import { LoadingButton } from "@/components/LoadingButton";
import { UnauthorizedAttemptAlert } from "@/components/UnauthorizedAttemptAlert";
import { useSession } from "@/hooks/useSession";
import { auditApi } from "@/services/apiClient";
import type { AuditEvent, AuditLogFilters, AuditStatus } from "@/types/audit";
import type { Role } from "@/types/auth";

const auditStatuses: AuditStatus[] = [
  "SUCCESS",
  "BLOCKED",
  "FAILED",
  "PENDING_CHAIN_CONFIRMATION",
  "CHAIN_CONFIRMED",
  "CHAIN_FAILED",
  "MOCK_CHAIN_CONFIRMED"
];

const auditRoles: Role[] = ["PROCUREMENT_OFFICER", "VENDOR", "EVALUATOR", "FINANCE_OFFICER", "AUDITOR"];

function metricLabel(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`;
}

export default function AuditPage() {
  const { user, loading: sessionLoading } = useSession();
  const [timeline, setTimeline] = useState<AuditEvent[]>([]);
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [draftTenderId, setDraftTenderId] = useState("");
  const [draftTxHash, setDraftTxHash] = useState("");
  const [draftStatus, setDraftStatus] = useState("");
  const [draftRole, setDraftRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canViewAudit = user?.permissions.includes("VIEW_AUDIT_LOGS") ?? false;

  const stats = useMemo(() => {
    const blocked = timeline.filter((event) => event.status === "BLOCKED").length;
    const successful = timeline.filter((event) => event.status === "SUCCESS" || event.status === "MOCK_CHAIN_CONFIRMED" || event.status === "CHAIN_CONFIRMED").length;
    const withProof = timeline.filter((event) => Boolean(event.txHash)).length;

    return { blocked, successful, withProof };
  }, [timeline]);

  const loadAudit = useCallback(async (nextFilters: AuditLogFilters) => {
    if (!canViewAudit) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await auditApi.listLogs(nextFilters);
      setTimeline(response.timeline);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load audit timeline.");
    } finally {
      setLoading(false);
    }
  }, [canViewAudit]);

  useEffect(() => {
    if (canViewAudit) {
      void loadAudit({});
    }
  }, [canViewAudit, loadAudit]);

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextFilters: AuditLogFilters = {
      tenderId: draftTenderId.trim() || undefined,
      txHash: draftTxHash.trim() || undefined,
      status: draftStatus ? (draftStatus as AuditStatus) : undefined,
      actorRole: draftRole ? (draftRole as Role) : undefined
    };

    setFilters(nextFilters);
    await loadAudit(nextFilters);
  }

  function clearFilters() {
    setDraftTenderId("");
    setDraftTxHash("");
    setDraftStatus("");
    setDraftRole("");
    const nextFilters: AuditLogFilters = {};
    setFilters(nextFilters);
    void loadAudit(nextFilters);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-800">Auditor View</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Immutable Audit Timeline</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Chronological evidence of successful procurement actions, blocked manipulation attempts, and backend relayer proofs.
            </p>
          </div>
          {canViewAudit ? (
            <button
              type="button"
              onClick={() => void loadAudit(filters)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </button>
          ) : null}
        </section>

        {!sessionLoading && !canViewAudit ? (
          <UnauthorizedAttemptAlert
            title="Restricted audit view"
            message="Only Auditor sessions can view the full immutable procurement timeline."
            details={[
              { label: "Actor Role", value: user?.role ?? "No session" },
              { label: "Required Permission", value: "VIEW_AUDIT_LOGS" }
            ]}
          />
        ) : null}

        {canViewAudit ? (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-emerald-800" aria-hidden="true" />
                  <p className="text-sm font-semibold text-slate-950">{metricLabel(stats.successful, "successful event", "successful events")}</p>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">Accepted actions after backend RBAC and workflow validation.</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm">
                <div className="flex items-center gap-3">
                  <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                  <p className="text-sm font-semibold">{metricLabel(stats.blocked, "blocked attempt", "blocked attempts")}</p>
                </div>
                <p className="mt-2 text-xs leading-5">Unauthorized or out-of-sequence actions remain visible to auditors.</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <ScrollText className="h-5 w-5 text-slate-700" aria-hidden="true" />
                  <p className="text-sm font-semibold text-slate-950">{metricLabel(stats.withProof, "backend relayer proof", "backend relayer proofs")}</p>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">Transaction hashes link validated events to blockchain evidence.</p>
              </div>
            </section>

            <form onSubmit={(event) => void applyFilters(event)} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-600" aria-hidden="true" />
                <h2 className="text-base font-semibold text-slate-950">Filter Audit Evidence</h2>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-800">Tender ID</span>
                  <input
                    value={draftTenderId}
                    onChange={(event) => setDraftTenderId(event.target.value)}
                    className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    placeholder="Tender record ID"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-800">Actor Role</span>
                  <select
                    value={draftRole}
                    onChange={(event) => setDraftRole(event.target.value)}
                    className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  >
                    <option value="">All roles</option>
                    {auditRoles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-800">Status</span>
                  <select
                    value={draftStatus}
                    onChange={(event) => setDraftStatus(event.target.value)}
                    className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  >
                    <option value="">All statuses</option>
                    {auditStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-800">Transaction Hash</span>
                  <input
                    value={draftTxHash}
                    onChange={(event) => setDraftTxHash(event.target.value)}
                    className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    placeholder="0x..."
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                >
                  Clear
                </button>
                <LoadingButton type="submit" loading={loading}>
                  Apply Filters
                </LoadingButton>
              </div>
            </form>

            {error ? <UnauthorizedAttemptAlert title="Unable to load audit logs" message={error} details={[{ label: "Backend API", value: "GET /audit/logs" }]} /> : null}

            {loading ? (
              <div className="flex min-h-72 items-center justify-center rounded-lg border border-slate-200 bg-white">
                <Loader2 className="h-7 w-7 animate-spin text-slate-500" aria-hidden="true" />
              </div>
            ) : (
              <AuditEventTimeline events={timeline} />
            )}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
