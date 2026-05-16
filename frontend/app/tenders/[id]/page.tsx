"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Boxes, FileLock2, History, Loader2, ScrollText } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AuditEventTimeline } from "@/components/AuditEventTimeline";
import { BlockchainProofCard } from "@/components/BlockchainProofCard";
import { TenderStateBadge } from "@/components/TenderStateBadge";
import { UnauthorizedAttemptAlert } from "@/components/UnauthorizedAttemptAlert";
import { auditApi, legacyEgpApi, manifestApi, proposalApi, tenderApi } from "@/services/apiClient";
import type { AuditEvent } from "@/types/audit";
import type { LegacyEgpRecord, ManifestStatusResponse } from "@/types/gateway";
import type { Tender } from "@/types/procurement";
import type { ProposalPackage } from "@/types/proposal";

function shortValue(value?: string | null) {
  if (!value) {
    return "Not submitted";
  }

  return value.length > 20 ? `${value.slice(0, 12)}...${value.slice(-8)}` : value;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function manifestApprovalSummary(manifest: ManifestStatusResponse | null) {
  if (!manifest) {
    return "No manifest response";
  }

  const approvedCount = manifest.approvedCount ?? manifest.approvalCount ?? 0;
  const publicationThreshold = manifest.publicationThreshold ?? manifest.manifest?.publicationThreshold ?? 0;

  return `${approvedCount}/${publicationThreshold} publication approvals`;
}

export default function TenderDetailPage() {
  const params = useParams<{ id: string }>();
  const tenderId = params.id;
  const [tender, setTender] = useState<Tender | null>(null);
  const [manifest, setManifest] = useState<ManifestStatusResponse | null>(null);
  const [proposalPackages, setProposalPackages] = useState<ProposalPackage[]>([]);
  const [legacyRecords, setLegacyRecords] = useState<LegacyEgpRecord[]>([]);
  const [timeline, setTimeline] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [tenderResponse, manifestResponse, proposalResponse, legacyResponse, auditResponse] = await Promise.all([
        tenderApi.get(tenderId),
        manifestApi.getStatus(tenderId).catch(() => null),
        proposalApi.listForTender(tenderId).catch(() => ({ proposalPackages: [] })),
        legacyEgpApi.listRecords({ tenderId }).catch(() => ({ records: [] })),
        auditApi.getTenderTimeline(tenderId).catch(() => ({ timeline: [] }))
      ]);

      setTender(tenderResponse.tender);
      setManifest(manifestResponse);
      setProposalPackages(proposalResponse.proposalPackages);
      setLegacyRecords(legacyResponse.records);
      setTimeline(auditResponse.timeline);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load tender workspace.");
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-800">Tender Workspace</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">{tender?.tenderCode ?? tenderId}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Gateway view of manifest status, proposal envelope commitments, backend relayer proofs, and old-system simulator links.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/tenders/${tenderId}/manifest`}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
            >
              Manifest
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/public-audit"
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            >
              Public Proof Trail
            </Link>
          </div>
        </section>

        {error ? <UnauthorizedAttemptAlert title="Tender workspace unavailable" message={error} /> : null}

        {loading ? (
          <div className="flex min-h-96 items-center justify-center rounded-lg border border-slate-200 bg-white">
            <Loader2 className="h-7 w-7 animate-spin text-slate-500" aria-hidden="true" />
          </div>
        ) : tender ? (
          <>
            <section className="grid gap-4 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-500">State</p>
                <div className="mt-3">
                  <TenderStateBadge state={tender.currentState} />
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-500">Manifest</p>
                <p className="mt-3 text-sm font-semibold text-slate-950">{manifest?.manifest?.status ?? "Not committed"}</p>
                <p className="mt-1 text-xs text-slate-500">{manifestApprovalSummary(manifest)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-500">Proposal Packages</p>
                <p className="mt-3 text-2xl font-semibold text-slate-950">{proposalPackages.length}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-500">Legacy Records</p>
                <p className="mt-3 text-2xl font-semibold text-slate-950">{legacyRecords.length}</p>
              </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <Boxes className="h-4 w-4 text-slate-600" aria-hidden="true" />
                  <h2 className="text-base font-semibold text-slate-950">Tender Record</h2>
                </div>
                <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
                  <div>
                    <dt className="font-medium text-slate-500">Agency</dt>
                    <dd className="mt-1 font-semibold text-slate-950">{tender.agency}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Current Version</dt>
                    <dd className="mt-1 font-semibold text-slate-950">v{tender.currentVersion}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Created</dt>
                    <dd className="mt-1 font-semibold text-slate-950">{formatDate(tender.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Updated</dt>
                    <dd className="mt-1 font-semibold text-slate-950">{formatDate(tender.updatedAt)}</dd>
                  </div>
                </dl>
              </div>
              <BlockchainProofCard txHash={tender.createdTxHash} status={tender.createdTxHash ? "MOCK_CONFIRMED" : "NOT_SUBMITTED"} />
            </section>

            <section className="grid gap-5 xl:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <FileLock2 className="h-4 w-4 text-slate-600" aria-hidden="true" />
                  <h2 className="text-base font-semibold text-slate-950">Proposal Envelope Commitments</h2>
                </div>
                <div className="mt-4 space-y-3">
                  {proposalPackages.flatMap((proposalPackage) => proposalPackage.envelopes ?? []).length === 0 ? (
                    <p className="text-sm text-slate-600">No proposal envelopes are linked yet.</p>
                  ) : (
                    proposalPackages.flatMap((proposalPackage) =>
                      (proposalPackage.envelopes ?? []).map((envelope) => (
                        <Link
                          key={envelope.id}
                          href={`/proposals/${proposalPackage.id}/envelopes`}
                          className="block rounded-md border border-slate-200 p-3 hover:bg-slate-50"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-950">{envelope.envelopeType}</p>
                            <span className="text-xs font-semibold text-slate-600">{envelope.blockchainStatus ?? "NOT_SUBMITTED"}</span>
                          </div>
                          <p className="mt-2 break-all text-xs text-slate-500">{shortValue(envelope.envelopeManifestHash)}</p>
                        </Link>
                      ))
                    )
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-slate-600" aria-hidden="true" />
                  <h2 className="text-base font-semibold text-slate-950">Old e-GP Simulator Links</h2>
                </div>
                <div className="mt-4 space-y-3">
                  {legacyRecords.length === 0 ? (
                    <p className="text-sm text-slate-600">No simulator records linked.</p>
                  ) : (
                    legacyRecords.map((record) => (
                      <article key={record.id} className="rounded-md border border-slate-200 p-3">
                        <p className="text-sm font-semibold text-slate-950">{record.operation}</p>
                        <p className="mt-1 text-xs text-slate-500">{record.recordType} - {record.operationalStatus}</p>
                        <p className="mt-2 break-all text-xs font-semibold text-slate-700">{shortValue(record.trustLayerTxHash)}</p>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-slate-600" aria-hidden="true" />
                <h2 className="text-base font-semibold text-slate-950">Audit Timeline</h2>
              </div>
              <AuditEventTimeline events={timeline} compact />
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
