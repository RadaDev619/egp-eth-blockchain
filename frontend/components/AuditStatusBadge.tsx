import type { AuditStatus } from "@/types/audit";

const statusStyles: Record<AuditStatus, string> = {
  SUCCESS: "border-emerald-200 bg-emerald-50 text-emerald-800",
  BLOCKED: "border-amber-200 bg-amber-50 text-amber-950",
  FAILED: "border-rose-200 bg-rose-50 text-rose-800",
  PENDING_CHAIN_CONFIRMATION: "border-sky-200 bg-sky-50 text-sky-800",
  CHAIN_CONFIRMED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  CHAIN_FAILED: "border-rose-200 bg-rose-50 text-rose-800",
  MOCK_CHAIN_CONFIRMED: "border-indigo-200 bg-indigo-50 text-indigo-800"
};

export function auditStatusLabel(status: AuditStatus) {
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function AuditStatusBadge({ status }: { status: AuditStatus }) {
  return (
    <span className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[status]}`}>
      {auditStatusLabel(status)}
    </span>
  );
}
