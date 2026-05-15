"use client";

import { FormEvent, useMemo, useState } from "react";
import { Gavel, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ApprovalStepper } from "@/components/ApprovalStepper";
import { LoadingButton } from "@/components/LoadingButton";
import { TenderTable } from "@/components/TenderTable";
import { TenderStateBadge } from "@/components/TenderStateBadge";
import { UnauthorizedAttemptAlert } from "@/components/UnauthorizedAttemptAlert";
import { useToast } from "@/components/ToastProvider";
import { useSession } from "@/hooks/useSession";
import { useTenders } from "@/hooks/useTenders";
import { approvalApi } from "@/services/apiClient";
import type { Tender } from "@/types/procurement";
import { blockedActionTitle, procurementErrorMessage } from "@/utils/errorMessages";
import { BlockchainProofCard } from "@/components/BlockchainProofCard";

function approvalActionFor(userRole: string | undefined) {
  if (userRole === "EVALUATOR") {
    return "evaluation";
  }

  if (userRole === "FINANCE_OFFICER") {
    return "payment";
  }

  return null;
}

function actionEligibleTender(tender: Tender, action: "evaluation" | "payment") {
  if (action === "evaluation") {
    return tender.currentState === "BID_SUBMITTED" || tender.currentState === "EVALUATION_PENDING";
  }

  return tender.currentState === "EVALUATION_APPROVED" || tender.currentState === "PAYMENT_PENDING";
}

function blockedDemoTender(tenders: Tender[], action: "evaluation" | "payment" | null) {
  if (action === "payment") {
    return tenders.find((tender) => tender.currentState === "CREATED" || tender.currentState === "BID_SUBMITTED") ?? null;
  }

  return null;
}

export default function ApprovalsPage() {
  const { user, loading: sessionLoading } = useSession();
  const { tenders, loading, error, refresh } = useTenders(Boolean(user));
  const { notify } = useToast();
  const [selectedTenderId, setSelectedTenderId] = useState("");
  const [comments, setComments] = useState("");
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const action = approvalActionFor(user?.role);

  const eligibleTenders = useMemo(
    () => (action ? tenders.filter((tender) => actionEligibleTender(tender, action)) : []),
    [action, tenders]
  );
  const demoBlockedTender = useMemo(() => blockedDemoTender(tenders, action), [action, tenders]);
  const selectedTender =
    tenders.find((tender) => tender.id === selectedTenderId) ?? eligibleTenders[0] ?? demoBlockedTender ?? null;
  const canApprove = action !== null && selectedTender ? actionEligibleTender(selectedTender, action) : false;

  async function runApproval() {
    if (!selectedTender || !action) {
      setBlockedMessage("Your verified role does not have an approval action on this page.");
      return;
    }

    setSubmitting(true);
    setBlockedMessage(null);

    try {
      if (action === "evaluation") {
        await approvalApi.approveEvaluation({ tenderId: selectedTender.id, comments });
      } else {
        await approvalApi.approvePayment({ tenderId: selectedTender.id, comments });
      }

      notify({
        type: "success",
        title: action === "evaluation" ? "Evaluation approved" : "Payment approved",
        message: "Approval was accepted by backend RBAC and workflow validation."
      });
      setComments("");
      await refresh();
    } catch (error) {
      const message = procurementErrorMessage(error);
      setBlockedMessage(message);
      notify({ type: "error", title: blockedActionTitle(error), message });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitApproval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runApproval();
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <section>
          <p className="text-sm font-semibold text-emerald-800">Approval Workflow</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Approvals</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Evaluation and payment approvals call protected backend APIs after role and state checks.
          </p>
        </section>

        {!sessionLoading && (!user || !action) ? (
          <UnauthorizedAttemptAlert
            title="Approval actions hidden"
            message="Only Evaluator and Finance Officer sessions can perform approval actions."
            details={[
              { label: "Actor Role", value: user?.role ?? "No session" },
              { label: "Allowed Approval Roles", value: "EVALUATOR, FINANCE_OFFICER" }
            ]}
          />
        ) : null}

        {blockedMessage ? (
          <UnauthorizedAttemptAlert
            title="Approval action blocked"
            message={blockedMessage}
            details={[
              { label: "Attempted Action", value: action === "payment" ? "APPROVE_PAYMENT" : "APPROVE_EVALUATION" },
              { label: "Current State", value: selectedTender?.currentState }
            ]}
          />
        ) : null}

        {error ? <UnauthorizedAttemptAlert title="Unable to load approval queue" message={error} /> : null}

        {loading ? (
          <div className="flex min-h-72 items-center justify-center rounded-lg border border-slate-200 bg-white">
            <Loader2 className="h-7 w-7 animate-spin text-slate-500" aria-hidden="true" />
          </div>
        ) : (
          <TenderTable
            tenders={eligibleTenders.length > 0 ? eligibleTenders : demoBlockedTender ? [demoBlockedTender] : []}
            user={user}
            onSelect={(tender) => setSelectedTenderId(tender.id)}
            selectedTenderId={selectedTender?.id}
            emptyMessage="No approval-ready tenders are currently available for your role."
          />
        )}

        {selectedTender ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <ApprovalStepper tender={selectedTender} />
            <div className="space-y-4">
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-950">Selected Tender</h2>
                    <p className="mt-1 text-sm text-slate-600">{selectedTender.tenderCode}</p>
                  </div>
                  <TenderStateBadge state={selectedTender.currentState} />
                </div>
              </section>
              <BlockchainProofCard
                txHash={selectedTender.approvals?.at(-1)?.txHash ?? selectedTender.createdTxHash}
                status={selectedTender.approvals?.at(-1)?.blockchainStatus ?? (selectedTender.createdTxHash ? "MOCK_CONFIRMED" : "NOT_SUBMITTED")}
              />
            </div>
          </div>
        ) : null}

        <form onSubmit={(event) => void submitApproval(event)} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Gavel className="h-5 w-5 text-slate-600" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-950">
              {action === "payment" ? "Approve Payment" : action === "evaluation" ? "Approve Evaluation" : "Approval Action"}
            </h2>
          </div>
          <label className="mt-4 grid gap-2">
            <span className="text-sm font-semibold text-slate-800">Comments</span>
            <textarea
              value={comments}
              onChange={(event) => setComments(event.target.value)}
              className="min-h-24 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
              placeholder="Approval note for audit context"
            />
          </label>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {action === "payment" && selectedTender && !canApprove ? (
              <p className="text-sm font-medium text-amber-800">
                Demo evidence: finance payment approval is disabled until evaluation is approved. Submitting would return 409.
              </p>
            ) : <span />}
            <div className="flex flex-wrap justify-end gap-2">
              {action === "payment" && selectedTender && !canApprove ? (
                <button
                  type="button"
                  onClick={() => void runApproval()}
                  disabled={submitting}
                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Attempt for Demo Audit
                </button>
              ) : null}
              <LoadingButton type="submit" loading={submitting} disabled={!action || !selectedTender || !canApprove}>
              Submit Approval
              </LoadingButton>
            </div>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
