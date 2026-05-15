import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import type { Tender, TenderState } from "@/types/procurement";

const steps: Array<{ state: TenderState; label: string }> = [
  { state: "CREATED", label: "Tender Created" },
  { state: "BID_SUBMITTED", label: "Bid Submitted" },
  { state: "EVALUATION_APPROVED", label: "Evaluation Approved" },
  { state: "PAYMENT_APPROVED", label: "Payment Approved" },
  { state: "COMPLETED", label: "Completed" }
];

const stateRank: Record<TenderState, number> = {
  CREATED: 0,
  OPEN_FOR_BIDS: 0,
  BID_SUBMITTED: 1,
  EVALUATION_PENDING: 1,
  EVALUATION_APPROVED: 2,
  PAYMENT_PENDING: 2,
  PAYMENT_APPROVED: 3,
  COMPLETED: 4,
  CANCELLED: -1
};

export function ApprovalStepper({ tender }: { tender: Tender }) {
  const currentRank = stateRank[tender.currentState];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-950">Approval Workflow</h3>
      <ol className="mt-5 grid gap-3 md:grid-cols-5">
        {steps.map((step, index) => {
          const complete = currentRank > index;
          const active = currentRank === index;
          const Icon = complete ? CheckCircle2 : active ? CircleDot : Circle;
          return (
            <li key={step.state} className="rounded-md border border-slate-200 p-3">
              <Icon className={`h-5 w-5 ${complete ? "text-emerald-700" : active ? "text-sky-700" : "text-slate-400"}`} aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-slate-900">{step.label}</p>
              <p className="mt-1 text-xs text-slate-500">
                {complete ? "Recorded" : active ? "Current state" : "Pending"}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
