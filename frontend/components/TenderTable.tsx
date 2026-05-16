"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { AuthenticatedUser } from "@/types/auth";
import type { Tender } from "@/types/procurement";
import { RoleBadge } from "./RoleBadge";
import { TenderStateBadge } from "./TenderStateBadge";
import { BlockchainProofCard } from "./BlockchainProofCard";

type TenderTableProps = {
  tenders: Tender[];
  user: AuthenticatedUser | null;
  onSelect?: (tender: Tender) => void;
  selectedTenderId?: string;
  emptyMessage?: string;
};

function latestVersion(tender: Tender) {
  return tender.versions?.[0] ?? tender.versions?.at(-1);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function TenderTable({ tenders, user, onSelect, selectedTenderId, emptyMessage = "No tenders found." }: TenderTableProps) {
  if (tenders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="text-sm font-medium text-slate-600">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              {["Tender", "State", "Version", "Created By", "Blockchain Proof", "Updated", "Action"].map((header) => (
                <th key={header} scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {tenders.map((tender) => {
              const version = latestVersion(tender);
              const selected = selectedTenderId === tender.id;
              return (
                <tr key={tender.id} className={selected ? "bg-emerald-50/60" : undefined}>
                  <td className="px-4 py-4">
                    <div className="min-w-52">
                      <p className="text-sm font-semibold text-slate-950">{version?.title ?? tender.tenderCode}</p>
                      <p className="mt-1 text-xs text-slate-500">{tender.tenderCode} - {tender.agency}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <TenderStateBadge state={tender.currentState} />
                  </td>
                  <td className="px-4 py-4 text-sm font-medium text-slate-800">v{tender.currentVersion}</td>
                  <td className="px-4 py-4">
                    <RoleBadge role={tender.createdByRole} compact />
                  </td>
                  <td className="px-4 py-4">
                    <div className="w-64">
                      <BlockchainProofCard txHash={tender.createdTxHash} status={tender.createdTxHash ? "MOCK_CONFIRMED" : "NOT_SUBMITTED"} compact />
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-600">{formatDate(tender.updatedAt)}</td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/tenders/${tender.id}`}
                        className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                      >
                        Details
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                      {onSelect ? (
                        <button
                          type="button"
                          onClick={() => onSelect(tender)}
                          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                        >
                          Select
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                      ) : user?.permissions.includes("CREATE_TENDER") ? (
                        <Link
                          href="/tenders/create"
                          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                        >
                          New Tender
                        </Link>
                      ) : (
                        <span className="text-xs font-medium text-slate-500">View only</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
