import Link from "next/link";
import { Ban, CheckCircle2, Clock3, ExternalLink, FileWarning, ShieldCheck } from "lucide-react";
import { AuditStatusBadge } from "@/components/AuditStatusBadge";
import { BlockchainProofCard } from "@/components/BlockchainProofCard";
import { RoleBadge } from "@/components/RoleBadge";
import type { AuditEvent } from "@/types/audit";

type AuditEventTimelineProps = {
  events: AuditEvent[];
  compact?: boolean;
};

function shortValue(value?: string | null, prefixLength = 10, suffixLength = 6) {
  if (!value) {
    return "Not available";
  }

  return value.length > prefixLength + suffixLength + 3
    ? `${value.slice(0, prefixLength)}...${value.slice(-suffixLength)}`
    : value;
}

function actionLabel(action: string) {
  return action
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function timelineIcon(event: AuditEvent) {
  if (event.status === "BLOCKED") {
    return Ban;
  }

  if (event.action === "TAMPERING_DETECTED" || event.status === "FAILED" || event.status === "CHAIN_FAILED") {
    return FileWarning;
  }

  if (event.txHash || event.blockchainStatus) {
    return ShieldCheck;
  }

  return CheckCircle2;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function AuditEventTimeline({ events, compact = false }: AuditEventTimelineProps) {
  if (events.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
        <Clock3 className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
        <h2 className="mt-3 text-base font-semibold text-slate-950">No audit events found</h2>
        <p className="mt-1 text-sm text-slate-600">Run the demo workflow to generate successful and blocked evidence.</p>
      </section>
    );
  }

  return (
    <ol className="space-y-4" aria-label="Immutable audit timeline">
      {events.map((event) => {
        const Icon = timelineIcon(event);
        const stateChange = event.fromState || event.toState ? `${event.fromState ?? "NONE"} -> ${event.toState ?? "NONE"}` : "No state change";
        const isBlocked = event.status === "BLOCKED";

        return (
          <li
            key={event.id}
            className={`rounded-lg border bg-white p-4 shadow-sm ${
              isBlocked ? "border-amber-300" : event.action === "TAMPERING_DETECTED" ? "border-rose-300" : "border-slate-200"
            }`}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
                    isBlocked ? "bg-amber-100 text-amber-900" : event.action === "TAMPERING_DETECTED" ? "bg-rose-100 text-rose-800" : "bg-emerald-50 text-emerald-800"
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-950">{actionLabel(event.action)}</h3>
                    <AuditStatusBadge status={event.status} />
                    {event.actorRole ? <RoleBadge role={event.actorRole} compact /> : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{formatTimestamp(event.timestamp)}</p>

                  <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <dt className="font-medium text-slate-500">Employee Hash</dt>
                      <dd className="mt-1 break-all font-semibold text-slate-900">
                        {shortValue(event.employeeHash ?? event.actorEmployeeHash, 12, 8)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">State Transition</dt>
                      <dd className="mt-1 font-semibold text-slate-900">{stateChange}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Tender</dt>
                      <dd className="mt-1 font-semibold text-slate-900">
                        {event.tenderId ? (
                          <Link href={`/audit/${event.tenderId}`} className="text-emerald-800 hover:text-emerald-950">
                            {event.tenderId}
                          </Link>
                        ) : (
                          "Not linked"
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Rejection Reason</dt>
                      <dd className="mt-1 font-semibold text-slate-900">{event.rejectionReason ?? "None"}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Blockchain Status</dt>
                      <dd className="mt-1 font-semibold text-slate-900">{event.blockchainStatus ?? "NOT_SUBMITTED"}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Transaction Hash</dt>
                      <dd className="mt-1 break-all font-semibold text-slate-900">{shortValue(event.txHash)}</dd>
                    </div>
                    {!compact ? (
                      <>
                        <div>
                          <dt className="font-medium text-slate-500">Backend Route</dt>
                          <dd className="mt-1 break-all font-semibold text-slate-900">{event.route ?? "Not available"}</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-slate-500">Request ID</dt>
                          <dd className="mt-1 break-all font-semibold text-slate-900">{shortValue(event.requestId, 12, 8)}</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-slate-500">Metadata Hash</dt>
                          <dd className="mt-1 break-all font-semibold text-slate-900">{shortValue(event.metadataHash, 12, 8)}</dd>
                        </div>
                      </>
                    ) : null}
                  </dl>
                </div>
              </div>

              {event.txHash ? (
                <div className="w-full lg:w-72">
                  <BlockchainProofCard txHash={event.txHash} status={event.blockchainStatus} compact />
                </div>
              ) : null}
            </div>
            {event.txHash && !event.txHash.startsWith("0xmock") ? (
              <a
                href={`https://sepolia.etherscan.io/tx/${event.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950"
              >
                Explorer Link
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
