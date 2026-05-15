"use client";

import Link from "next/link";
import { ArrowLeft, FileUp } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoadingButton } from "@/components/LoadingButton";
import { UnauthorizedAttemptAlert } from "@/components/UnauthorizedAttemptAlert";
import { useSession } from "@/hooks/useSession";
import { tenderApi } from "@/services/apiClient";
import { useToast } from "@/components/ToastProvider";
import { procurementErrorMessage, blockedActionTitle } from "@/utils/errorMessages";

const emptyForm = {
  tenderCode: "",
  agency: "Ministry of Finance",
  title: "",
  description: ""
};

function fallbackDocumentHash(input: typeof emptyForm) {
  const normalized = `${input.tenderCode}:${input.title}:${input.description}:${Date.now()}`;
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }

  return `0xphase13demo${hash.toString(16).padStart(8, "0")}`;
}

export default function CreateTenderPage() {
  const router = useRouter();
  const { user, loading: sessionLoading } = useSession();
  const { notify } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [document, setDocument] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const canCreateTender = user?.permissions.includes("CREATE_TENDER") ?? false;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreateTender) {
      setBlockedMessage("Your verified role is not allowed to create tender records.");
      return;
    }

    setSubmitting(true);
    setBlockedMessage(null);

    try {
      await tenderApi.create({
        ...form,
        document,
        documentHash: document ? undefined : fallbackDocumentHash(form)
      });
      notify({
        type: "success",
        title: "Tender created",
        message: "TENDER_CREATED audit evidence and backend relayer proof were requested."
      });
      router.push("/tenders");
    } catch (error) {
      const message = procurementErrorMessage(error);
      setBlockedMessage(message);
      notify({ type: "error", title: blockedActionTitle(error), message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <Link
          href="/tenders"
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Tenders
        </Link>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-emerald-800">Procurement Officer</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Create Tender</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            This action calls `POST /tender/create`. Backend RBAC and the procurement state machine decide whether it is allowed.
          </p>
        </section>

        {!sessionLoading && (!user || !canCreateTender) ? (
          <UnauthorizedAttemptAlert
            title="Create tender unavailable"
            message="Only a backend-mapped Procurement Officer can create a tender."
            details={[
              { label: "Actor Role", value: user?.role ?? "No session" },
              { label: "Required Permission", value: "CREATE_TENDER" }
            ]}
          />
        ) : null}

        {blockedMessage ? (
          <UnauthorizedAttemptAlert
            title="Tender action blocked"
            message={blockedMessage}
            details={[
              { label: "Route", value: "POST /tender/create" },
              { label: "Audit Result", value: "Backend records blocked attempts when authorization or workflow rejects action" }
            ]}
          />
        ) : null}

        <form onSubmit={(event) => void handleSubmit(event)} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-slate-800">Tender Code</span>
              <input
                required
                value={form.tenderCode}
                onChange={(event) => setForm((current) => ({ ...current, tenderCode: event.target.value }))}
                className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                placeholder="TDR-DEMO-001"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-slate-800">Agency</span>
              <input
                required
                value={form.agency}
                onChange={(event) => setForm((current) => ({ ...current, agency: event.target.value }))}
                className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </label>
          </div>

          <label className="mt-4 grid gap-2">
            <span className="text-sm font-semibold text-slate-800">Title</span>
            <input
              required
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
              placeholder="Bridge maintenance works"
            />
          </label>

          <label className="mt-4 grid gap-2">
            <span className="text-sm font-semibold text-slate-800">Description</span>
            <textarea
              required
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="min-h-28 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
              placeholder="Procurement scope and audit-relevant tender description"
            />
          </label>

          <label className="mt-4 grid gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <FileUp className="h-4 w-4" aria-hidden="true" />
              Tender PDF
            </span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => setDocument(event.target.files?.[0] ?? null)}
              className="text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-800 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
            />
            <span className="text-xs text-slate-500">
              Uploading a PDF lets the backend compute and store the document hash. If omitted, a demo hash is sent for seeded flows.
            </span>
          </label>

          <div className="mt-6 flex justify-end">
            <LoadingButton type="submit" loading={submitting} disabled={!canCreateTender}>
              Create Tender
            </LoadingButton>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
