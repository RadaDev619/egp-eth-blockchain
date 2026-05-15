import { BadgeCheck, Building2, Fingerprint, IdCard } from "lucide-react";
import type { AuthenticatedUser, DemoNdiProfile } from "@/types/auth";
import { RoleBadge } from "./RoleBadge";

function shortValue(value: string, head = 10, tail = 6) {
  if (value.length <= head + tail + 3) {
    return value;
  }

  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function maskEmploymentId(value: string) {
  const [prefix] = value.split("-");
  return `${prefix || "EMP"}-***`;
}

function hasEmployeeHash(identity: AuthenticatedUser | DemoNdiProfile): identity is AuthenticatedUser {
  return "employeeHash" in identity;
}

type NDIIdentityCardProps = {
  user?: AuthenticatedUser | null;
  profile?: DemoNdiProfile;
  selected?: boolean;
  onSelect?: () => void;
};

export function NDIIdentityCard({ user, profile, selected = false, onSelect }: NDIIdentityCardProps) {
  const identity = user ?? profile;

  if (!identity) {
    return null;
  }

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
            <BadgeCheck className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            <span>Mock NDI demo profile</span>
          </div>
          <h3 className="mt-2 text-base font-semibold text-slate-950">{identity.position}</h3>
          <p className="mt-1 text-sm text-slate-600">{identity.employer}</p>
        </div>
        {user ? (
          <RoleBadge role={user.role} compact />
        ) : (
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
            Profile
          </span>
        )}
      </div>

      <dl className="mt-5 grid gap-3 text-sm">
        <div className="flex items-center gap-3">
          <IdCard className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <div className="min-w-0">
            <dt className="text-xs font-medium uppercase text-slate-500">Employment ID</dt>
            <dd className="font-medium text-slate-900">{user ? maskEmploymentId(user.employmentId) : identity.employmentId}</dd>
          </div>
        </div>
        {hasEmployeeHash(identity) ? (
          <div className="flex items-center gap-3">
            <Fingerprint className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-xs font-medium uppercase text-slate-500">Employee Hash</dt>
              <dd className="break-all font-medium text-slate-900">{shortValue(identity.employeeHash)}</dd>
            </div>
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          <Building2 className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <div className="min-w-0">
            <dt className="text-xs font-medium uppercase text-slate-500">Employment Type</dt>
            <dd className="font-medium text-slate-900">{identity.employmentType}</dd>
          </div>
        </div>
      </dl>
    </>
  );

  if (!onSelect) {
    return <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">{content}</section>;
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border bg-white p-5 text-left shadow-sm transition hover:border-emerald-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 ${
        selected ? "border-emerald-600 ring-2 ring-emerald-100" : "border-slate-200"
      }`}
    >
      {content}
    </button>
  );
}
