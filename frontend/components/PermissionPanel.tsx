import { CheckCircle2 } from "lucide-react";
import type { Permission } from "@/types/auth";

const permissionLabels: Partial<Record<Permission, string>> = {
  CREATE_TENDER: "Create tender",
  UPLOAD_TENDER_DOCUMENT: "Upload tender document",
  CREATE_TENDER_VERSION: "Create tender amendment",
  SUBMIT_TENDER_AMENDMENT: "Submit amendment",
  SUBMIT_BID: "Submit bid",
  VIEW_ELIGIBLE_TENDERS: "View eligible tenders",
  APPROVE_EVALUATION: "Approve evaluation",
  REJECT_EVALUATION: "Reject evaluation",
  VIEW_ASSIGNED_TENDERS: "View assigned tenders",
  APPROVE_PAYMENT: "Approve payment",
  REJECT_PAYMENT: "Reject payment",
  VIEW_FINANCE_QUEUE: "View finance queue",
  VIEW_AUDIT_LOGS: "View audit logs",
  VERIFY_PROCUREMENT_HISTORY: "Verify procurement history",
  VERIFY_DOCUMENT: "Verify document",
  VIEW_BLOCKCHAIN_PROOFS: "View blockchain proofs",
  VIEW_ROLE_ACTION_HISTORY: "View role-action history",
  COMPLETE_PROCUREMENT: "Complete procurement",
  CANCEL_TENDER: "Cancel tender"
};

type PermissionPanelProps = {
  permissions: Permission[];
};

export function PermissionPanel({ permissions }: PermissionPanelProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">Allowed Actions</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
          {permissions.length}
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {permissions.map((permission) => (
          <div key={permission} className="flex min-h-10 items-center gap-2 rounded-md border border-slate-200 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
            <span className="text-sm font-medium text-slate-800">{permissionLabels[permission] ?? permission}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
