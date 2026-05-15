"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  BarChart3,
  ClipboardList,
  FileCheck2,
  Gavel,
  Landmark,
  LayoutDashboard,
  ScrollText,
  ShieldCheck
} from "lucide-react";
import type { AuthenticatedUser, Permission } from "@/types/auth";

const navItems: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  permissions?: Permission[];
}> = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tenders", label: "Tenders", icon: ClipboardList, permissions: ["CREATE_TENDER", "VIEW_ELIGIBLE_TENDERS"] },
  { href: "/bids", label: "Bids", icon: FileCheck2, permissions: ["SUBMIT_BID"] },
  { href: "/approvals", label: "Approvals", icon: Gavel, permissions: ["APPROVE_EVALUATION", "APPROVE_PAYMENT"] },
  { href: "/audit", label: "Audit Logs", icon: ScrollText, permissions: ["VIEW_AUDIT_LOGS"] },
  { href: "/verify", label: "Integrity Verification", icon: ShieldCheck, permissions: ["VERIFY_DOCUMENT"] },
  { href: "/proofs", label: "Blockchain Proofs", icon: BarChart3, permissions: ["VIEW_BLOCKCHAIN_PROOFS"] }
];

function canAccess(user: AuthenticatedUser | null, permissions?: Permission[]) {
  if (!permissions || permissions.length === 0) {
    return true;
  }

  return permissions.some((permission) => user?.permissions.includes(permission));
}

type SidebarProps = {
  user: AuthenticatedUser | null;
};

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const visibleItems = navItems.filter((item) => canAccess(user, item.permissions));

  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-800 text-white">
          <Landmark className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">e-GP Trust Layer</p>
          <p className="text-xs text-slate-500">Procurement audit middleware</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Primary navigation">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-700 ${
                active ? "bg-emerald-50 text-emerald-900" : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-4">
        <div className="flex items-start gap-3 rounded-md bg-slate-50 p-3">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
          <p className="text-xs leading-5 text-slate-600">
            Backend session controls identity, role, and available actions.
          </p>
        </div>
      </div>
    </aside>
  );
}
