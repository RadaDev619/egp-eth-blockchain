"use client";

import { FormEvent, useMemo, useState } from "react";
import { Hash, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { LoadingButton } from "@/components/LoadingButton";
import { TenderTable } from "@/components/TenderTable";
import { UnauthorizedAttemptAlert } from "@/components/UnauthorizedAttemptAlert";
import { useSession } from "@/hooks/useSession";
import { useTenders } from "@/hooks/useTenders";
import { bidApi } from "@/services/apiClient";
import { useToast } from "@/components/ToastProvider";
import { procurementErrorMessage, blockedActionTitle } from "@/utils/errorMessages";
import { ApprovalStepper } from "@/components/ApprovalStepper";

function demoBidHash(tenderId: string) {
  return `0xbid${tenderId.replace(/[^a-zA-Z0-9]/g, "").slice(-20).padStart(20, "0")}`;
}

export default function BidsPage() {
  const { user, loading: sessionLoading } = useSession();
  const { tenders, loading, error, refresh } = useTenders(Boolean(user));
  const { notify } = useToast();
  const [selectedTenderId, setSelectedTenderId] = useState("");
  const [bidHash, setBidHash] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const canSubmitBid = user?.permissions.includes("SUBMIT_BID") ?? false;

  const eligibleTenders = useMemo(
    () => tenders.filter((tender) => tender.currentState === "CREATED" || tender.currentState === "OPEN_FOR_BIDS"),
    [tenders]
  );
  const selectedTender = tenders.find((tender) => tender.id === selectedTenderId) ?? eligibleTenders[0] ?? null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTender) {
      setBlockedMessage("Select a tender before submitting a bid.");
      return;
    }

    if (!canSubmitBid) {
      setBlockedMessage("Your verified role is not allowed to submit bids.");
      return;
    }

    setSubmitting(true);
    setBlockedMessage(null);

    try {
      await bidApi.submit({
        tenderId: selectedTender.id,
        bidHash: bidHash || demoBidHash(selectedTender.id)
      });
      notify({
        type: "success",
        title: "Bid submitted",
        message: "BID_SUBMITTED audit evidence and relayer proof were requested."
      });
      setBidHash("");
      await refresh();
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
      <div className="mx-auto max-w-7xl space-y-6">
        <section>
          <p className="text-sm font-semibold text-emerald-800">Vendor Workspace</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Bids</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Vendors can submit bids only when the backend workflow state allows `SUBMIT_BID`.
          </p>
        </section>

        {!sessionLoading && (!user || !canSubmitBid) ? (
          <UnauthorizedAttemptAlert
            title="Bid submission hidden"
            message="Only backend-mapped Vendor sessions can submit bids. Other roles can inspect tender state without seeing the bid action."
            details={[
              { label: "Actor Role", value: user?.role ?? "No session" },
              { label: "Required Permission", value: "SUBMIT_BID" }
            ]}
          />
        ) : null}

        {blockedMessage ? (
          <UnauthorizedAttemptAlert
            title="Bid action blocked"
            message={blockedMessage}
            details={[
              { label: "Route", value: "POST /bid/submit" },
              { label: "Expected State", value: "CREATED or OPEN_FOR_BIDS" }
            ]}
          />
        ) : null}

        {error ? <UnauthorizedAttemptAlert title="Unable to load tenders" message={error} /> : null}

        {loading ? (
          <div className="flex min-h-72 items-center justify-center rounded-lg border border-slate-200 bg-white">
            <Loader2 className="h-7 w-7 animate-spin text-slate-500" aria-hidden="true" />
          </div>
        ) : (
          <TenderTable
            tenders={eligibleTenders}
            user={user}
            onSelect={(tender) => {
              setSelectedTenderId(tender.id);
              setBidHash(demoBidHash(tender.id));
            }}
            selectedTenderId={selectedTender?.id}
            emptyMessage="No tenders are currently open for bid submission."
          />
        )}

        {selectedTender ? <ApprovalStepper tender={selectedTender} /> : null}

        <form onSubmit={(event) => void handleSubmit(event)} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Hash className="h-5 w-5 text-slate-600" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-950">Submit Bid Hash</h2>
          </div>
          <label className="mt-4 grid gap-2">
            <span className="text-sm font-semibold text-slate-800">Bid Hash</span>
            <input
              value={bidHash}
              onChange={(event) => setBidHash(event.target.value)}
              className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
              placeholder={selectedTender ? demoBidHash(selectedTender.id) : "Select a tender first"}
            />
          </label>
          <div className="mt-5 flex justify-end">
            <LoadingButton type="submit" loading={submitting} disabled={!canSubmitBid || !selectedTender}>
              Submit Bid
            </LoadingButton>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
