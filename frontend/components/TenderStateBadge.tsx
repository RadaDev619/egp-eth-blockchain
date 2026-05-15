import type { TenderState } from "@/types/procurement";

const stateStyles: Record<TenderState, string> = {
  CREATED: "border-sky-200 bg-sky-50 text-sky-800",
  OPEN_FOR_BIDS: "border-sky-200 bg-sky-50 text-sky-800",
  BID_SUBMITTED: "border-violet-200 bg-violet-50 text-violet-800",
  EVALUATION_PENDING: "border-violet-200 bg-violet-50 text-violet-800",
  EVALUATION_APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  PAYMENT_PENDING: "border-amber-200 bg-amber-50 text-amber-900",
  PAYMENT_APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  COMPLETED: "border-slate-200 bg-slate-100 text-slate-800",
  CANCELLED: "border-rose-200 bg-rose-50 text-rose-800"
};

export function stateLabel(state: TenderState) {
  return state
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function TenderStateBadge({ state }: { state: TenderState }) {
  return (
    <span className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${stateStyles[state]}`}>
      {stateLabel(state)}
    </span>
  );
}
