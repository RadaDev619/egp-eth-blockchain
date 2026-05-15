"use client";

import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import type { AuthenticatedUser } from "@/types/auth";
import { RoleBadge } from "./RoleBadge";

type TopbarProps = {
  user: AuthenticatedUser | null;
  onLogout: () => Promise<void>;
};

function shortHash(value?: string) {
  if (!value) {
    return "";
  }

  return value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

export function Topbar({ user, onLogout }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-6">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">Procurement Trust Dashboard</p>
        <p className="hidden text-xs text-slate-500 sm:block">Mock NDI employment identity</p>
      </div>

      <div className="flex items-center gap-3">
        {user ? (
          <div className="hidden items-center gap-3 md:flex">
            <div className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2">
              <ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden="true" />
              <span className="text-xs font-semibold text-slate-700">{shortHash(user.employeeHash)}</span>
            </div>
            <RoleBadge role={user.role} />
          </div>
        ) : (
          <Link
            href="/login"
            className="rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
          >
            Login
          </Link>
        )}

        {user ? (
          <button
            type="button"
            onClick={() => void onLogout()}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </header>
  );
}
