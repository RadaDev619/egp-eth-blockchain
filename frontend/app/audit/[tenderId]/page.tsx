"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileStack, Loader2, ScrollText } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AuditEventTimeline } from "@/components/AuditEventTimeline";
import { BlockchainProofCard } from "@/components/BlockchainProofCard";
import { TenderStateBadge } from "@/components/TenderStateBadge";
import { UnauthorizedAttemptAlert } from "@/components/UnauthorizedAttemptAlert";
import { useSession } from "@/hooks/useSession";
import { auditApi } from "@/services/apiClient";
import type { TenderAuditTimelineResponse } from "@/types/audit";

function paramValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? "";
}

function shortHash(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  return value.length > 28 ? `${value.slice(0, 16)}...${value.slice(-10)}` : value;
}

export default function TenderAuditPage() {
  const params = useParams();
  const tenderId = paramValue(params.tenderId);
  const { user, loading: sessionLoading } = useSession();
  const [data, setData] = useState<TenderAuditTimelineResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canViewAudit = user?.permissions.includes("VIEW_AUDIT_LOGS") ?? false;

  const latestProof = useMemo(
    () =>
      data?.timeline
        .filter((event) => Boolean(event.txHash))
        .at(-1) ?? null,
    [data]
  );

  useEffect(() => {
    if (!canViewAudit || !tenderId) {
      return;
    }

    async function loadTenderAudit() {
      setLoading(true);
      setError(null);

      try {
        const response = await auditApi.getTenderTimeline(tenderId);
        setData(response);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load tender timeline.");
      } finally {
        setLoading(false);
      }
    }

    void loadTenderAudit();
  }, [canViewAudit, tenderId]);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <Link
          href="/audit"
          className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:text-emerald-950"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to audit logs
        </Link>

        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-800">Tender Audit Detail</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Procurement Timeline</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Tender-specific evidence includes preserved versions, approvals, blocked attempts, and backend relayer proofs.
            </p>
          </div>
          {data?.tender ? <TenderStateBadge state={data.tender.currentState} /> : null}
        </section>

        {!sessionLoading && !canViewAudit ? (
          <UnauthorizedAttemptAlert
            title="Restricted tender timeline"
            message="Only Auditor sessions can inspect tender-specific audit history."
            details={[
              { label: "Actor Role", value: user?.role ?? "No session" },
              { label: "Required Permission", value: "VIEW_AUDIT_LOGS" }
            ]}
          />
        ) : null}

        {error ? <UnauthorizedAttemptAlert title="Unable to load tender audit timeline" message={error} details={[{ label: "Tender ID", value: tenderId }]} /> : null}

        {loading ? (
          <div className="flex min-h-72 items-center justify-center rounded-lg border border-slate-200 bg-white">
            <Loader2 className="h-7 w-7 animate-spin text-slate-500" aria-hidden="true" />
          </div>
        ) : null}

        {data ? (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <FileStack className="h-5 w-5 text-slate-700" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{data.tender.tenderCode}</p>
                    <p className="mt-1 text-xs text-slate-500">{data.tender.agency}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-600">Current version: v{data.tender.currentVersion}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <ScrollText className="h-5 w-5 text-slate-700" aria-hidden="true" />
                  <p className="text-sm font-semibold text-slate-950">{data.timeline.length} timeline events</p>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-600">
                  {data.timeline.filter((event) => event.status === "BLOCKED").length} blocked attempts recorded for this tender.
                </p>
              </div>
              <BlockchainProofCard
                txHash={latestProof?.txHash}
                status={latestProof?.blockchainStatus}
                title="Latest Backend Relayer Proof"
                compact
              />
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-950">Append-Only Tender Versions</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Version</th>
                      <th className="px-3 py-3">Title</th>
                      <th className="px-3 py-3">Document Hash</th>
                      <th className="px-3 py-3">CID</th>
                      <th className="px-3 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.versions.map((version) => (
                      <tr key={version.id}>
                        <td className="px-3 py-3 font-semibold text-slate-900">v{version.versionNumber}</td>
                        <td className="px-3 py-3 text-slate-700">{version.title}</td>
                        <td className="px-3 py-3 font-mono text-xs text-slate-700">{shortHash(version.documentHash)}</td>
                        <td className="px-3 py-3 font-mono text-xs text-slate-700">{version.ipfsCid ?? "Not recorded"}</td>
                        <td className="px-3 py-3 text-slate-600">{new Date(version.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <AuditEventTimeline events={data.timeline} />
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
