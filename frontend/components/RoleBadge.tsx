import type { Role } from "@/types/auth";

const roleLabels: Record<Role, string> = {
  PROCUREMENT_OFFICER: "Procurement Officer",
  VENDOR: "Vendor",
  EVALUATOR: "Evaluator",
  FINANCE_OFFICER: "Finance Officer",
  AUDITOR: "Auditor",
  TEC_MEMBER: "TEC Member",
  TEC_CHAIR: "TEC Chair",
  APPROVING_OFFICER: "Approving Officer",
  FINANCIAL_INSTITUTION_OFFICER: "Financial Institution"
};

const roleStyles: Record<Role, string> = {
  PROCUREMENT_OFFICER: "border-emerald-200 bg-emerald-50 text-emerald-800",
  VENDOR: "border-sky-200 bg-sky-50 text-sky-800",
  EVALUATOR: "border-violet-200 bg-violet-50 text-violet-800",
  FINANCE_OFFICER: "border-amber-200 bg-amber-50 text-amber-900",
  AUDITOR: "border-rose-200 bg-rose-50 text-rose-800",
  TEC_MEMBER: "border-violet-200 bg-violet-50 text-violet-800",
  TEC_CHAIR: "border-indigo-200 bg-indigo-50 text-indigo-800",
  APPROVING_OFFICER: "border-cyan-200 bg-cyan-50 text-cyan-800",
  FINANCIAL_INSTITUTION_OFFICER: "border-amber-200 bg-amber-50 text-amber-900"
};

type RoleBadgeProps = {
  role: Role;
  compact?: boolean;
};

export function roleLabel(role: Role) {
  return roleLabels[role];
}

export function RoleBadge({ role, compact = false }: RoleBadgeProps) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${roleStyles[role]}`}
      title={roleLabel(role)}
    >
      {compact ? roleLabel(role).split(" ")[0] : roleLabel(role)}
    </span>
  );
}
