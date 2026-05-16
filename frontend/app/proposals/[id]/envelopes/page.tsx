"use client";

import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { FileUp, Loader2, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BlockchainProofCard } from "@/components/BlockchainProofCard";
import { LoadingButton } from "@/components/LoadingButton";
import { UnauthorizedAttemptAlert } from "@/components/UnauthorizedAttemptAlert";
import { useToast } from "@/components/ToastProvider";
import { keyManagementApi, proposalApi } from "@/services/apiClient";
import type { ProposalEnvelopeType, ProposalPackage } from "@/types/proposal";
import { nowHash } from "@/utils/demoHash";
import { blockedActionTitle, procurementErrorMessage } from "@/utils/errorMessages";

const envelopeTypes: ProposalEnvelopeType[] = ["ELIGIBILITY", "TECHNICAL", "FINANCIAL", "SUPPORTING_DOCUMENTS", "TENDER_SECURITY"];

export default function ProposalEnvelopesPage() {
  const params = useParams<{ id: string }>();
  const proposalPackageId = params.id;
  const { notify } = useToast();
  const [proposalPackage, setProposalPackage] = useState<ProposalPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [requestingEnvelopeId, setRequestingEnvelopeId] = useState<string | null>(null);
  const [envelopeType, setEnvelopeType] = useState<ProposalEnvelopeType>("TECHNICAL");
  const [manifestHash, setManifestHash] = useState(nowHash("envelope-manifest"));
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await proposalApi.getPackage(proposalPackageId);
      setProposalPackage(response.proposalPackage);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load proposal package.");
    } finally {
      setLoading(false);
    }
  }, [proposalPackageId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadEnvelope(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError("Choose an encrypted file before uploading.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      await proposalApi.uploadEncryptedEnvelope({
        proposalPackageId,
        envelopeType,
        envelopeManifestHash: manifestHash,
        encryptedFile: file,
        keyId: `kms-demo-${envelopeType.toLowerCase()}`,
        encryptionAlgorithm: "AES-GCM"
      });
      notify({ type: "success", title: "Encrypted envelope uploaded", message: "The backend computed the encrypted file hash." });
      await load();
    } catch (uploadError) {
      const message = procurementErrorMessage(uploadError);
      setError(message);
      notify({ type: "error", title: blockedActionTitle(uploadError), message });
    } finally {
      setUploading(false);
    }
  }

  async function requestKeyRelease(proposalEnvelopeId: string) {
    setRequestingEnvelopeId(proposalEnvelopeId);
    setError(null);

    try {
      await keyManagementApi.requestRelease(proposalEnvelopeId);
      notify({ type: "success", title: "Key release requested", message: "Policy checks were evaluated by the backend." });
      await load();
    } catch (requestError) {
      const message = procurementErrorMessage(requestError);
      setError(message);
      notify({ type: "error", title: blockedActionTitle(requestError), message });
    } finally {
      setRequestingEnvelopeId(null);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <section>
          <p className="text-sm font-semibold text-emerald-800">Proposal Package</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Encrypted Envelopes</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Envelope rows expose encrypted hashes, storage references, and backend relayer proof status.
          </p>
        </section>

        {error ? <UnauthorizedAttemptAlert title="Envelope action blocked" message={error} /> : null}

        {loading ? (
          <div className="flex min-h-80 items-center justify-center rounded-lg border border-slate-200 bg-white">
            <Loader2 className="h-7 w-7 animate-spin text-slate-500" aria-hidden="true" />
          </div>
        ) : proposalPackage ? (
          <>
            <section className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-500">Package Status</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{proposalPackage.status}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-500">Envelope Count</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{proposalPackage.envelopes?.length ?? 0}</p>
              </div>
              <BlockchainProofCard txHash={proposalPackage.txHash} status={proposalPackage.blockchainStatus} compact />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              {(proposalPackage.envelopes ?? []).map((envelope) => (
                <article key={envelope.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{envelope.envelopeType}</p>
                      <p className="mt-1 text-xs text-slate-500">{envelope.blockchainStatus ?? "NOT_SUBMITTED"}</p>
                    </div>
                    <ShieldCheck className="h-5 w-5 text-emerald-700" aria-hidden="true" />
                  </div>
                  <dl className="mt-4 grid gap-3 text-xs">
                    <div>
                      <dt className="font-medium text-slate-500">Encrypted File Hash</dt>
                      <dd className="mt-1 break-all font-semibold text-slate-950">{envelope.encryptedFileHash}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Envelope Manifest Hash</dt>
                      <dd className="mt-1 break-all font-semibold text-slate-950">{envelope.envelopeManifestHash}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Storage Reference</dt>
                      <dd className="mt-1 break-all font-semibold text-slate-950">{envelope.storageReference ?? "Not stored"}</dd>
                    </div>
                  </dl>
                  <div className="mt-4">
                    <LoadingButton
                      loading={requestingEnvelopeId === envelope.id}
                      onClick={() => void requestKeyRelease(envelope.id)}
                    >
                      Request Key Release
                    </LoadingButton>
                  </div>
                </article>
              ))}
            </section>

            <form onSubmit={(event) => void uploadEnvelope(event)} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <FileUp className="h-4 w-4 text-slate-600" aria-hidden="true" />
                <h2 className="text-base font-semibold text-slate-950">Upload Encrypted Envelope</h2>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-800">Envelope Type</span>
                  <select
                    value={envelopeType}
                    onChange={(event) => setEnvelopeType(event.target.value as ProposalEnvelopeType)}
                    className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  >
                    {envelopeTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-800">Envelope Manifest Hash</span>
                  <input
                    value={manifestHash}
                    onChange={(event) => setManifestHash(event.target.value)}
                    className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </label>
              </div>
              <label className="mt-4 grid gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                <span className="text-sm font-semibold text-slate-800">Encrypted File</span>
                <input
                  type="file"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  className="text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-800 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                />
              </label>
              <div className="mt-5 flex justify-end">
                <LoadingButton type="submit" loading={uploading}>
                  Upload Encrypted Envelope
                </LoadingButton>
              </div>
            </form>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
