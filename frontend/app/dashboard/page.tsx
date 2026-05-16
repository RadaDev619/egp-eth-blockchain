"use client";

import Link from "next/link";
import { ArrowRight, CircleAlert, FileText, Loader2, ScrollText, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { NDIIdentityCard } from "@/components/NDIIdentityCard";
import { PermissionPanel } from "@/components/PermissionPanel";
import { RoleBadge, roleLabel } from "@/components/RoleBadge";
import { useSession } from "@/hooks/useSession";
import { useTenders } from "@/hooks/useTenders";
import type { Role } from "@/types/auth";
import { TenderStateBadge } from "@/components/TenderStateBadge";
import { BlockchainProofCard } from "@/components/BlockchainProofCard";

const roleFocus: Record<Role, { title: string; summary: string; primaryAction: string }> = {
  PROCUREMENT_OFFICER: {
    title: "Tender Control",
    summary: "Create tender records and amendments as append-only procurement versions.",
    primaryAction: "Create Tender"
  },
  VENDOR: {
    title: "Bid Submission",
    summary: "Submit bids against eligible tender records.",
    primaryAction: "Submit Bid"
  },
  EVALUATOR: {
    title: "Evaluation Approval",
    summary: "Approve evaluations after bid submission.",
    primaryAction: "Approve Evaluation"
  },
  FINANCE_OFFICER: {
    title: "Payment Approval",
    summary: "Approve payment after evaluation approval is recorded.",
    primaryAction: "Approve Payment"
  },
  AUDITOR: {
    title: "Audit Oversight",
    summary: "Inspect procurement timelines, blocked attempts, and backend relayer proofs.",
    primaryAction: "View Audit Logs"
  },
  TEC_MEMBER: {
    title: "Technical Committee",
    summary: "Declare conflict status and review assigned technical evidence.",
    primaryAction: "Review Committee"
  },
  TEC_CHAIR: {
    title: "Committee Chair",
    summary: "Finalize evaluation reports and submit award recommendation hashes.",
    primaryAction: "Finalize Evaluation"
  },
  APPROVING_OFFICER: {
    title: "Threshold Approval",
    summary: "Approve tender publication and award decisions under threshold policy.",
    primaryAction: "Approve Award"
  },
  FINANCIAL_INSTITUTION_OFFICER: {
    title: "Financial Key Release",
    summary: "Release permitted envelope keys after policy checks pass.",
    primaryAction: "KMS Requests"
  }
};

function AuthRequired() {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
      <ShieldCheck className="h-10 w-10 text-emerald-700" aria-hidden="true" />
      <h1 className="mt-4 text-2xl font-semibold text-slate-950">NDI Login Required</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Start a mock Bhutan NDI proof request to open the procurement dashboard.
      </p>
      <Link
        href="/login"
        className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
      >
        Login with Bhutan NDI
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

export default function DashboardPage() {
  const { user, loading } = useSession();
  const { tenders } = useTenders(Boolean(user));
  const focus = user ? roleFocus[user.role] : null;
  const latestTender = tenders[0];
  const blockedReadyCount = tenders.filter((tender) => tender.currentState === "BID_SUBMITTED").length;

  return (
    <AppShell>
      {loading ? (
        <div className="flex min-h-96 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-slate-500" aria-hidden="true" />
        </div>
      ) : !user || !focus ? (
        <AuthRequired />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">
                  NDI Verified
                </span>
                <RoleBadge role={user.role} />
              </div>
              <h1 className="mt-4 text-3xl font-semibold text-slate-950">Dashboard</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {roleLabel(user.role)} session from backend employment mapping.
              </p>
            </div>
            <Link
              href="/login"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            >
              Switch Demo Profile
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </section>

          <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
            <NDIIdentityCard user={user} />

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-500">Role Workspace</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-950">{focus.title}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{focus.summary}</p>
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-slate-100">
                  <FileText className="h-5 w-5 text-slate-700" aria-hidden="true" />
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-slate-200 p-4">
                  <p className="text-xs font-medium text-slate-500">Primary Action</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">{focus.primaryAction}</p>
                </div>
                <div className="rounded-md border border-slate-200 p-4">
                  <p className="text-xs font-medium text-slate-500">Proof Mode</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">Mock Chain Confirmed</p>
                </div>
                <div className="rounded-md border border-slate-200 p-4">
                  <p className="text-xs font-medium text-slate-500">Audit View</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">Append-Only Timeline</p>
                </div>
              </div>
            </section>
          </div>

          <PermissionPanel permissions={user.permissions} />

          <section className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">Tender Records</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{tenders.length}</p>
              <p className="mt-2 text-sm text-slate-600">Loaded from `GET /tenders` using the backend session.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">Evaluation Queue</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{blockedReadyCount}</p>
              <p className="mt-2 text-sm text-slate-600">Bids waiting for evaluator approval.</p>
            </div>
            {latestTender ? (
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-500">Latest Tender State</p>
                <div className="mt-3">
                  <TenderStateBadge state={latestTender.currentState} />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-950">{latestTender.tenderCode}</p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5">
                <p className="text-sm font-semibold text-slate-500">Latest Tender State</p>
                <p className="mt-2 text-sm text-slate-600">No tender records loaded yet.</p>
              </div>
            )}
          </section>

          {latestTender?.createdTxHash ? (
            <BlockchainProofCard txHash={latestTender.createdTxHash} status="MOCK_CONFIRMED" title="Latest Tender Blockchain Proof" />
          ) : null}

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <CircleAlert className="h-5 w-5 text-amber-700" aria-hidden="true" />
                <h2 className="text-base font-semibold text-slate-950">Blocked Action Evidence</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Finance approval before evaluation and vendor payment approval are recorded as blocked audit events.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <ScrollText className="h-5 w-5 text-sky-700" aria-hidden="true" />
                <h2 className="text-base font-semibold text-slate-950">Auditor Timeline</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Successful actions show backend relayer transaction hashes beside role and employee hash evidence.
              </p>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
