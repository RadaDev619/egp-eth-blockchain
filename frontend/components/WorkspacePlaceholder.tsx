"use client";

import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { AppShell } from "./AppShell";
import { RoleBadge } from "./RoleBadge";
import { useSession } from "@/hooks/useSession";

type WorkspacePlaceholderProps = {
  title: string;
  eyebrow: string;
  summary: string;
  icon: LucideIcon;
};

export function WorkspacePlaceholder({ title, eyebrow, summary, icon: Icon }: WorkspacePlaceholderProps) {
  const { user, loading } = useSession();

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                <Icon className="h-4 w-4" aria-hidden="true" />
                {eyebrow}
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-slate-950">{title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{summary}</p>
            </div>
            {user ? <RoleBadge role={user.role} /> : null}
          </div>

          <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-800">
              {loading ? "Checking session..." : user ? "NDI session active" : "NDI login required"}
            </p>
            <Link
              href={user ? "/dashboard" : "/login"}
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
            >
              {user ? "Return to Dashboard" : "Login with Bhutan NDI"}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
