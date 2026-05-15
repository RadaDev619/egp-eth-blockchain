"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { FileSearch, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BlockchainProofCard } from "@/components/BlockchainProofCard";
import { DocumentHashCard } from "@/components/DocumentHashCard";
import { LoadingButton } from "@/components/LoadingButton";
import { TenderStateBadge } from "@/components/TenderStateBadge";
import { UnauthorizedAttemptAlert } from "@/components/UnauthorizedAttemptAlert";
import { useToast } from "@/components/ToastProvider";
import { useSession } from "@/hooks/useSession";
import { useTenders } from "@/hooks/useTenders";
import { verificationApi } from "@/services/apiClient";
import type { DocumentVerificationResponse } from "@/types/audit";
import type { Tender, TenderVersion } from "@/types/procurement";
import { procurementErrorMessage } from "@/utils/errorMessages";

function latestVersion(tender: Tender | null) {
  return tender?.versions?.at(-1) ?? null;
}

function versionOptions(tender: Tender | null): TenderVersion[] {
  return tender?.versions ?? [];
}

function hashPreview(hash?: string | null) {
  if (!hash) {
    return "Not available";
  }

  return hash.length > 28 ? `${hash.slice(0, 16)}...${hash.slice(-10)}` : hash;
}

export default function VerifyPage() {
  const { user, loading: sessionLoading } = useSession();
  const canVerify = user?.permissions.includes("VERIFY_DOCUMENT") ?? false;
  const { tenders, loading: tendersLoading, error: tendersError, refresh } = useTenders(Boolean(user && canVerify));
  const { notify } = useToast();
  const [selectedTenderId, setSelectedTenderId] = useState("");
  const [selectedVersionNumber, setSelectedVersionNumber] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DocumentVerificationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedTender = useMemo(
    () => tenders.find((tender) => tender.id === selectedTenderId) ?? tenders[0] ?? null,
    [selectedTenderId, tenders]
  );
  const versions = useMemo(() => versionOptions(selectedTender), [selectedTender]);
  const selectedVersion = useMemo(() => {
    if (!selectedTender) {
      return null;
    }

    const versionNumber = Number(selectedVersionNumber || selectedTender.currentVersion);
    return versions.find((version) => version.versionNumber === versionNumber) ?? latestVersion(selectedTender);
  }, [selectedTender, selectedVersionNumber, versions]);

  useEffect(() => {
    if (!selectedTenderId && tenders[0]) {
      setSelectedTenderId(tenders[0].id);
    }
  }, [selectedTenderId, tenders]);

  useEffect(() => {
    if (selectedTender && !selectedVersionNumber) {
      setSelectedVersionNumber(String(selectedTender.currentVersion));
    }
  }, [selectedTender, selectedVersionNumber]);

  async function submitVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const uploadedDocument = documentFile ?? fileInputRef.current?.files?.[0] ?? null;

    if (!selectedTender || !uploadedDocument) {
      setError("Select a tender and upload a PDF document before verification.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const response = await verificationApi.verifyDocument({
        tenderId: selectedTender.id,
        versionNumber: selectedVersion?.versionNumber ?? selectedTender.currentVersion,
        document: uploadedDocument
      });
      setResult(response);

      if (response.tamperingDetected) {
        notify({
          type: "error",
          title: "TAMPERING DETECTED",
          message: "The uploaded PDF hash does not match the stored tender version."
        });
      } else {
        notify({
          type: "success",
          title: "Document verified",
          message: "The uploaded PDF matches the recorded procurement version."
        });
      }
    } catch (verifyError) {
      const message = procurementErrorMessage(verifyError);
      setError(message);
      notify({ type: "error", title: "Document verification failed", message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-800">Integrity Verification</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Document Hash Verification</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Upload a PDF to compare its backend-computed hash against the stored tender version and record tampering evidence when mismatched.
            </p>
          </div>
          {selectedTender ? <TenderStateBadge state={selectedTender.currentState} /> : null}
        </section>

        {!sessionLoading && !canVerify ? (
          <UnauthorizedAttemptAlert
            title="Restricted verification view"
            message="Document verification is available only to sessions with procurement history verification permission."
            details={[
              { label: "Actor Role", value: user?.role ?? "No session" },
              { label: "Required Permission", value: "VERIFY_DOCUMENT" }
            ]}
          />
        ) : null}

        {tendersError ? (
          <UnauthorizedAttemptAlert title="Unable to load tender records" message={tendersError} details={[{ label: "Backend API", value: "GET /tenders" }]} />
        ) : null}

        {canVerify ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <form onSubmit={(event) => void submitVerification(event)} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <FileSearch className="h-5 w-5 text-slate-700" aria-hidden="true" />
                <h2 className="text-base font-semibold text-slate-950">Verify Tender Document</h2>
              </div>

              {tendersLoading ? (
                <div className="mt-6 flex min-h-48 items-center justify-center rounded-md border border-slate-200 bg-slate-50">
                  <Loader2 className="h-7 w-7 animate-spin text-slate-500" aria-hidden="true" />
                </div>
              ) : (
                <div className="mt-5 grid gap-4">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-slate-800">Tender</span>
                    <select
                      value={selectedTender?.id ?? ""}
                      onChange={(event) => {
                        setSelectedTenderId(event.target.value);
                        setSelectedVersionNumber("");
                        setResult(null);
                      }}
                      className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    >
                      {tenders.map((tender) => (
                        <option key={tender.id} value={tender.id}>
                          {tender.tenderCode} - {tender.agency}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-slate-800">Tender Version</span>
                    <select
                      value={selectedVersion?.versionNumber ? String(selectedVersion.versionNumber) : selectedVersionNumber}
                      onChange={(event) => {
                        setSelectedVersionNumber(event.target.value);
                        setResult(null);
                      }}
                      className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    >
                      {versions.length > 0 ? (
                        versions.map((version) => (
                          <option key={version.id} value={version.versionNumber}>
                            v{version.versionNumber} - {version.title}
                          </option>
                        ))
                      ) : (
                        <option value={selectedTender?.currentVersion ?? 1}>Current version</option>
                      )}
                    </select>
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-slate-800">PDF Document</span>
                    <input
                      ref={fileInputRef}
                      data-testid="document-upload-input"
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(event) => {
                        setDocumentFile(event.target.files?.[0] ?? null);
                        setResult(null);
                        setError(null);
                      }}
                      className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                    <span className="text-xs leading-5 text-slate-500">The backend validates PDF type and size before computing the SHA256 hash.</span>
                  </label>

                  {error ? <UnauthorizedAttemptAlert title="Verification request blocked" message={error} /> : null}

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => void refresh()}
                      className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    >
                      Refresh Tenders
                    </button>
                    <LoadingButton type="submit" loading={submitting} disabled={!selectedTender}>
                      Verify Document
                    </LoadingButton>
                  </div>
                </div>
              )}
            </form>

            <aside className="space-y-4">
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-800" aria-hidden="true" />
                  <div>
                    <h2 className="text-base font-semibold text-slate-950">Recorded Version Evidence</h2>
                    <dl className="mt-4 grid gap-3 text-xs">
                      <div>
                        <dt className="font-medium text-slate-500">Expected Hash</dt>
                        <dd className="mt-1 break-all font-semibold text-slate-900">
                          {hashPreview(selectedVersion?.documentHash ?? result?.expectedDocumentHash)}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-500">Version</dt>
                        <dd className="mt-1 font-semibold text-slate-900">
                          {selectedVersion?.versionNumber ?? selectedTender?.currentVersion ?? "Not selected"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-500">Stored Evidence CID</dt>
                        <dd className="mt-1 break-all font-semibold text-slate-900">{selectedVersion?.ipfsCid ?? result?.ipfsCid ?? "Not recorded"}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </section>

              {result?.tamperingDetected ? (
                <section className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-rose-950 shadow-sm">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <div>
                      <h2 className="text-base font-semibold">TAMPERING DETECTED</h2>
                      <p className="mt-2 text-sm leading-6">
                        The mismatch is logged as document verification failure and tampering evidence for auditor review.
                      </p>
                    </div>
                  </div>
                </section>
              ) : null}
            </aside>
          </div>
        ) : null}

        {result ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <DocumentHashCard
              expectedHash={result.expectedDocumentHash}
              uploadedHash={result.uploadedDocumentHash}
              verified={result.verified}
              tamperingDetected={result.tamperingDetected}
              ipfsCid={result.ipfsCid}
            />
            <BlockchainProofCard
              txHash={result.txHash}
              status={result.blockchainStatus}
              title={result.tamperingDetected ? "Tampering Backend Relayer Proof" : "Verification Audit Proof"}
            />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
