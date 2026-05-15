"use client";

import Link from "next/link";
import { ArrowRight, Loader2, PlusCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TenderTable } from "@/components/TenderTable";
import { UnauthorizedAttemptAlert } from "@/components/UnauthorizedAttemptAlert";
import { useSession } from "@/hooks/useSession";
import { useTenders } from "@/hooks/useTenders";

export default function TendersPage() {
  const { user, loading: sessionLoading } = useSession();
  const { tenders, loading, error, refresh } = useTenders(Boolean(user));
  const canCreateTender = user?.permissions.includes("CREATE_TENDER") ?? false;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-800">Procurement Records</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Tenders</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Tender records are append-only. Changes should be created as new versions rather than silent edits.
            </p>
          </div>
          {canCreateTender ? (
            <Link
              href="/tenders/create"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
            >
              <PlusCircle className="h-4 w-4" aria-hidden="true" />
              Create Tender
            </Link>
          ) : null}
        </section>

        {!sessionLoading && !user ? (
          <UnauthorizedAttemptAlert
            title="NDI login required"
            message="Login with Bhutan NDI before viewing protected procurement records."
            details={[{ label: "Required evidence", value: "Verified backend session" }]}
          />
        ) : null}

        {user && !canCreateTender ? (
          <UnauthorizedAttemptAlert
            title="Create tender action hidden"
            message="Your mapped role can view relevant tender records, but tender creation is reserved for Procurement Officer."
            details={[
              { label: "Actor Role", value: user.role },
              { label: "Required Permission", value: "CREATE_TENDER" }
            ]}
          />
        ) : null}

        {error ? (
          <UnauthorizedAttemptAlert
            title="Unable to load tenders"
            message={error}
            details={[{ label: "Backend API", value: "GET /tenders" }]}
          />
        ) : null}

        {loading ? (
          <div className="flex min-h-72 items-center justify-center rounded-lg border border-slate-200 bg-white">
            <Loader2 className="h-7 w-7 animate-spin text-slate-500" aria-hidden="true" />
          </div>
        ) : (
          <TenderTable tenders={tenders} user={user} emptyMessage="No tender records have been created yet." />
        )}

        {user ? (
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
          >
            Refresh
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </AppShell>
  );
}
