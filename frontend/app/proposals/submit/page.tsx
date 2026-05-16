"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { ArrowRight, FileLock2, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { LoadingButton } from "@/components/LoadingButton";
import { UnauthorizedAttemptAlert } from "@/components/UnauthorizedAttemptAlert";
import { useToast } from "@/components/ToastProvider";
import { useSession } from "@/hooks/useSession";
import { useTenders } from "@/hooks/useTenders";
import { proposalApi } from "@/services/apiClient";
import type { ProposalEnvelopeType } from "@/types/proposal";
import { demoHash, nowHash } from "@/utils/demoHash";
import { blockedActionTitle, procurementErrorMessage } from "@/utils/errorMessages";

const envelopeTypes: ProposalEnvelopeType[] = ["ELIGIBILITY", "TECHNICAL", "FINANCIAL", "SUPPORTING_DOCUMENTS", "TENDER_SECURITY"];

function defaultStorageKey(tenderCode: string, envelopeType: ProposalEnvelopeType) {
  return `egp-simulator/${tenderCode || "tender"}/${envelopeType.toLowerCase()}.enc`;
}

export default function SubmitProposalPage() {
  const { user, loading: sessionLoading } = useSession();
  const { tenders, loading: tendersLoading } = useTenders(Boolean(user));
  const { notify } = useToast();
  const [tenderId, setTenderId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = user?.permissions.includes("SUBMIT_PROPOSAL_PACKAGE") ?? false;
  const selectedTender = useMemo(() => tenders.find((tender) => tender.id === tenderId), [tenderId, tenders]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedTender) {
      setError("Select a published tender before submitting a proposal package.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const packageHash = nowHash(`proposal-package:${selectedTender.id}`);
      const envelopes = envelopeTypes.map((envelopeType) => ({
        envelopeType,
        encryptedFileHash: demoHash(`${packageHash}:${envelopeType}:encrypted`),
        envelopeManifestHash: demoHash(`${packageHash}:${envelopeType}:manifest`),
        storageReference: defaultStorageKey(selectedTender.tenderCode, envelopeType),
        storageProvider: "egp-simulator",
        contentType: "application/octet-stream",
        byteSize: 4096,
        originalFilename: `${envelopeType.toLowerCase()}-proposal.pdf.enc`,
        encryptionAlgorithm: "AES-256-GCM",
        keyId: `kms-demo-${envelopeType.toLowerCase()}`
      }));
      const response = await proposalApi.submitPackage({
        tenderId: selectedTender.id,
        packageHash,
        envelopes
      });

      notify({
        type: "success",
        title: "Proposal package submitted",
        message: "Encrypted envelope commitments were recorded by the backend relayer."
      });
      window.location.href = `/proposals/${response.proposalPackage.id}/envelopes`;
    } catch (submitError) {
      const message = procurementErrorMessage(submitError);
      setError(message);
      notify({ type: "error", title: blockedActionTitle(submitError), message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <section>
          <p className="text-sm font-semibold text-emerald-800">Vendor Workspace</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Submit Proposal Package</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            The old-system simulator receives encrypted file references while the trust layer records package and envelope commitments.
          </p>
        </section>

        {!sessionLoading && !canSubmit ? (
          <UnauthorizedAttemptAlert
            title="Proposal submission unavailable"
            message="Only a backend-mapped Vendor can submit proposal packages."
            details={[
              { label: "Actor Role", value: user?.role ?? "No session" },
              { label: "Required Permission", value: "SUBMIT_PROPOSAL_PACKAGE" }
            ]}
          />
        ) : null}

        {error ? <UnauthorizedAttemptAlert title="Proposal action blocked" message={error} /> : null}

        <form onSubmit={(event) => void handleSubmit(event)} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <FileLock2 className="h-4 w-4 text-slate-600" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-950">Encrypted Envelope Set</h2>
          </div>

          <label className="mt-5 grid gap-2">
            <span className="text-sm font-semibold text-slate-800">Tender</span>
            <select
              value={tenderId}
              onChange={(event) => setTenderId(event.target.value)}
              className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
              required
            >
              <option value="">Select tender</option>
              {tenders.map((tender) => (
                <option key={tender.id} value={tender.id}>
                  {tender.tenderCode} - {tender.currentState}
                </option>
              ))}
            </select>
          </label>

          {tendersLoading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading tenders
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {envelopeTypes.map((envelopeType) => (
              <div key={envelopeType} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-950">{envelopeType}</p>
                <p className="mt-2 break-all text-xs text-slate-600">{defaultStorageKey(selectedTender?.tenderCode ?? "tender", envelopeType)}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <Link
              href="/tenders"
              className="inline-flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            >
              Tenders
            </Link>
            <LoadingButton type="submit" loading={submitting} disabled={!canSubmit}>
              Submit Package
            </LoadingButton>
          </div>
        </form>

        {selectedTender ? (
          <Link href={`/tenders/${selectedTender.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800">
            Open tender workspace
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </AppShell>
  );
}
