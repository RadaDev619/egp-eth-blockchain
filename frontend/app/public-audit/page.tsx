"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  DatabaseZap,
  ExternalLink,
  FileSearch,
  Landmark,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck
} from "lucide-react";
import { AuditStatusBadge } from "@/components/AuditStatusBadge";
import { RoleBadge } from "@/components/RoleBadge";
import { publicAuditApi } from "@/services/apiClient";
import type {
  PublicAuditEvent,
  PublicAuditFilters,
  PublicAuditProof,
  PublicAuditProofType,
  PublicTenderAuditResponse,
  PublicTenderSummary
} from "@/types/audit";

const proofTypes: PublicAuditProofType[] = [
  "TENDER_MANIFEST",
  "PROPOSAL_PACKAGE",
  "ENVELOPE_COMMITMENT",
  "KEY_RELEASE",
  "EVALUATION_REPORT",
  "AWARD_RECOMMENDATION",
  "AWARD_APPROVAL",
  "CONTRACT_HASH",
  "TAMPERING_DETECTED"
];

function shortValue(value?: string | null, prefixLength = 12, suffixLength = 8) {
  if (!value) {
    return "Not submitted";
  }

  return value.length > prefixLength + suffixLength + 3 ? `${value.slice(0, prefixLength)}...${value.slice(-suffixLength)}` : value;
}

function label(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function explorerUrl(txHash: string) {
  if (txHash.startsWith("0xmock")) {
    return null;
  }

  return `https://sepolia.etherscan.io/tx/${txHash}`;
}

function StatBand({ proofs, timeline }: { proofs: PublicAuditProof[]; timeline: PublicAuditEvent[] }) {
  const stats = useMemo(() => {
    const txCount = new Set(proofs.map((proof) => proof.sourceTxHash).filter(Boolean)).size;
    const blockedCount = timeline.filter((event) => event.status === "BLOCKED").length;
    const hashCount = new Set(proofs.map((proof) => proof.proofHash)).size;

    return { txCount, blockedCount, hashCount };
  }, [proofs, timeline]);

  return (
    <section className="grid gap-4 md:grid-cols-3">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-800" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-950">{proofs.length} public proofs</p>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-600">Published proof records expose commitments, not proposal contents.</p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <DatabaseZap className="h-5 w-5 text-slate-700" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-950">{stats.txCount} transaction hashes</p>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-600">Backend relayer proofs are shown without user wallet data.</p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <FileSearch className="h-5 w-5 text-slate-700" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-950">{stats.hashCount} hash commitments</p>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-600">{stats.blockedCount} blocked attempts visible when present.</p>
      </div>
    </section>
  );
}

function TenderList({
  tenders,
  selectedTenderId,
  onSelect
}: {
  tenders: PublicTenderSummary[];
  selectedTenderId: string;
  onSelect: (tenderId: string) => void;
}) {
  if (tenders.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
        <p className="text-sm font-semibold text-slate-950">No public proof trails found</p>
        <p className="mt-1 text-xs text-slate-600">Run the demo seed or complete the secure gateway workflow.</p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-950">Published Tender Proof Trails</h2>
      </div>
      <div className="divide-y divide-slate-200">
        {tenders.map((tender) => {
          const active = selectedTenderId === tender.id;

          return (
            <button
              key={tender.id}
              type="button"
              onClick={() => onSelect(tender.id)}
              className={`grid w-full gap-3 px-5 py-4 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-700 ${
                active ? "bg-emerald-50" : "bg-white"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{tender.tenderCode}</p>
                  <p className="mt-1 text-xs text-slate-600">{tender.agency}</p>
                </div>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{label(tender.currentState)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{tender.proofCount ?? 0} proofs</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ProofGrid({ proofs }: { proofs: PublicAuditProof[] }) {
  if (proofs.length === 0) {
    return null;
  }

  return (
    <section className="grid gap-3 lg:grid-cols-2">
      {proofs.map((proof) => (
        <article key={proof.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-950">{proof.publicLabel}</p>
              <p className="mt-1 text-xs text-slate-500">{label(proof.proofType)}</p>
            </div>
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-900">
              {proof.blockchainStatus ?? "NOT_SUBMITTED"}
            </span>
          </div>
          <dl className="mt-4 grid gap-3 text-xs">
            <div>
              <dt className="font-medium text-slate-500">Proof Hash</dt>
              <dd className="mt-1 break-all font-semibold text-slate-950">{shortValue(proof.proofHash, 18, 10)}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Transaction Hash</dt>
              <dd className="mt-1 break-all font-semibold text-slate-950">{shortValue(proof.sourceTxHash, 18, 10)}</dd>
            </div>
          </dl>
        </article>
      ))}
    </section>
  );
}

function PublicTimeline({ events }: { events: PublicAuditEvent[] }) {
  if (events.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
        <p className="text-sm font-semibold text-slate-950">No public timeline events</p>
        <p className="mt-1 text-xs text-slate-600">Public evidence will appear here after proof records are published.</p>
      </section>
    );
  }

  return (
    <ol className="space-y-3" aria-label="Public audit proof timeline">
      {events.map((event) => {
        const url = event.txHash ? explorerUrl(event.txHash) : null;

        return (
          <li key={`${event.source}-${event.id}`} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-950">{event.publicLabel ?? label(event.action)}</h3>
                  <AuditStatusBadge status={event.status} />
                  {event.actorRole ? <RoleBadge role={event.actorRole} compact /> : null}
                </div>
                <p className="mt-1 text-xs text-slate-500">{formatTimestamp(event.timestamp)}</p>
                <dl className="mt-4 grid gap-3 text-xs md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <dt className="font-medium text-slate-500">State</dt>
                    <dd className="mt-1 font-semibold text-slate-950">
                      {event.fromState || event.toState ? `${event.fromState ?? "NONE"} -> ${event.toState ?? "NONE"}` : "No state change"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Proof Hash</dt>
                    <dd className="mt-1 break-all font-semibold text-slate-950">{shortValue(event.documentHash, 14, 8)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Metadata Hash</dt>
                    <dd className="mt-1 break-all font-semibold text-slate-950">{shortValue(event.metadataHash, 14, 8)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Transaction Hash</dt>
                    <dd className="mt-1 break-all font-semibold text-slate-950">{shortValue(event.txHash, 14, 8)}</dd>
                  </div>
                </dl>
                {event.rejectionReason ? (
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{event.rejectionReason}</span>
                  </div>
                ) : null}
              </div>
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                >
                  Explorer
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function PublicAuditPage() {
  const [tenders, setTenders] = useState<PublicTenderSummary[]>([]);
  const [overviewProofs, setOverviewProofs] = useState<PublicAuditProof[]>([]);
  const [selectedTender, setSelectedTender] = useState<PublicTenderAuditResponse | null>(null);
  const [selectedTenderId, setSelectedTenderId] = useState("");
  const [proofType, setProofType] = useState("");
  const [txHash, setTxHash] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async (filters: PublicAuditFilters = {}) => {
    setLoading(true);
    setError(null);

    try {
      const response = await publicAuditApi.list(filters);
      setTenders(response.tenders);
      setOverviewProofs(response.proofs);

      if (!filters.tenderId && response.tenders[0]) {
        setSelectedTenderId(response.tenders[0].id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load public audit proofs.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTender = useCallback(async (tenderId: string) => {
    if (!tenderId) {
      setSelectedTender(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await publicAuditApi.getTender(tenderId);
      setSelectedTender(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load tender proof trail.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (selectedTenderId) {
      void loadTender(selectedTenderId);
    }
  }, [selectedTenderId, loadTender]);

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const filters: PublicAuditFilters = {
      tenderId: selectedTenderId || undefined,
      proofType: proofType ? (proofType as PublicAuditProofType) : undefined,
      txHash: txHash.trim() || undefined
    };

    if (filters.txHash) {
      setLoading(true);
      setError(null);
      try {
        const response = await publicAuditApi.getTx(filters.txHash);
        setSelectedTender(null);
        setOverviewProofs(response.proofs);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load transaction proof.");
      } finally {
        setLoading(false);
      }
      return;
    }

    await loadOverview(filters);

    if (filters.tenderId) {
      await loadTender(filters.tenderId);
    }
  }

  function clearFilters() {
    setProofType("");
    setTxHash("");
    void loadOverview();
  }

  const activeProofs = selectedTender?.proofs ?? overviewProofs;
  const activeTimeline = selectedTender?.timeline ?? [];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 md:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-800 text-white">
              <Landmark className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">e-GP Trust Layer</p>
              <p className="text-xs text-slate-500">Public audit portal</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => void loadOverview()}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6 lg:px-8">
        <section className="space-y-2">
          <p className="text-sm font-semibold text-emerald-800">Privacy-Safe Proof Trail</p>
          <h1 className="text-3xl font-semibold text-slate-950">Public Audit Portal</h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Verify tender milestones through hashes, timestamps, roles, and backend relayer transaction references. Confidential
            proposal contents, raw Employment IDs, session data, and internal request metadata are not exposed.
          </p>
        </section>

        <form onSubmit={(event) => void applyFilters(event)} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-600" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-950">Search Public Evidence</h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-slate-800">Tender</span>
              <select
                value={selectedTenderId}
                onChange={(event) => setSelectedTenderId(event.target.value)}
                className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
              >
                <option value="">All published tenders</option>
                {tenders.map((tender) => (
                  <option key={tender.id} value={tender.id}>
                    {tender.tenderCode}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-slate-800">Proof Type</span>
              <select
                value={proofType}
                onChange={(event) => setProofType(event.target.value)}
                className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
              >
                <option value="">All proof types</option>
                {proofTypes.map((type) => (
                  <option key={type} value={type}>
                    {label(type)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-slate-800">Transaction Hash</span>
              <input
                value={txHash}
                onChange={(event) => setTxHash(event.target.value)}
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
            <button
              type="submit"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
            >
              Search
            </button>
          </div>
        </form>

        {error ? (
          <section className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{error}</p>
            </div>
          </section>
        ) : null}

        {loading ? (
          <div className="flex min-h-80 items-center justify-center rounded-lg border border-slate-200 bg-white">
            <Loader2 className="h-7 w-7 animate-spin text-slate-500" aria-hidden="true" />
          </div>
        ) : (
          <>
            <StatBand proofs={activeProofs} timeline={activeTimeline} />
            <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
              <TenderList tenders={tenders} selectedTenderId={selectedTenderId} onSelect={setSelectedTenderId} />
              <div className="space-y-5">
                {selectedTender?.tender ? (
                  <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-sm font-semibold text-slate-950">{selectedTender.tender.tenderCode}</p>
                    <p className="mt-1 text-xs text-slate-600">{selectedTender.tender.agency}</p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-700">
                        {label(selectedTender.tender.currentState)}
                      </span>
                      <span className="rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-900">
                        {selectedTender.proofs.length} public proofs
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-700">
                        {selectedTender.blockchainTransactions.length} relayer records
                      </span>
                    </div>
                  </section>
                ) : null}
                <ProofGrid proofs={activeProofs} />
                <PublicTimeline events={activeTimeline.length > 0 ? activeTimeline : activeProofs.map((proof) => ({
                  id: proof.id,
                  source: "PUBLIC_PROOF",
                  tenderId: proof.tenderId,
                  action: proof.proofType,
                  status: proof.blockchainStatus === "MOCK_CONFIRMED" ? "MOCK_CHAIN_CONFIRMED" : proof.blockchainStatus ? "CHAIN_CONFIRMED" : "SUCCESS",
                  actorRole: null,
                  fromState: null,
                  toState: null,
                  rejectionReason: null,
                  documentHash: proof.proofHash,
                  metadataHash: null,
                  txHash: proof.sourceTxHash,
                  blockchainStatus: proof.blockchainStatus,
                  publicLabel: proof.publicLabel,
                  timestamp: proof.createdAt,
                  createdAt: proof.createdAt
                }))} />
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
