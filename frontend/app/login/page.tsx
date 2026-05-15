"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, QrCode, ShieldCheck } from "lucide-react";
import { NDIIdentityCard } from "@/components/NDIIdentityCard";
import { authApi, ApiClientError } from "@/services/apiClient";
import { useSession } from "@/hooks/useSession";
import type { DemoNdiProfile, NDIStartResponse } from "@/types/auth";

export default function LoginPage() {
  const router = useRouter();
  const { establishSession } = useSession();
  const [proofRequest, setProofRequest] = useState<NDIStartResponse | null>(null);
  const [profiles, setProfiles] = useState<DemoNdiProfile[]>([]);
  const [selectedEmploymentId, setSelectedEmploymentId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadProofRequest() {
      setLoading(true);
      setError(null);

      try {
        const [proof, demoProfiles] = await Promise.all([authApi.startNdiLogin(), authApi.listDemoProfiles()]);

        if (!mounted) {
          return;
        }

        const availableProfiles = proof.demoProfiles.length > 0 ? proof.demoProfiles : demoProfiles.profiles;
        setProofRequest(proof);
        setProfiles(availableProfiles);
        setSelectedEmploymentId(availableProfiles[0]?.employmentId ?? "");
      } catch (requestError) {
        if (!mounted) {
          return;
        }

        setError(requestError instanceof Error ? requestError.message : "Unable to start mock NDI login.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadProofRequest();

    return () => {
      mounted = false;
    };
  }, []);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.employmentId === selectedEmploymentId) ?? null,
    [profiles, selectedEmploymentId]
  );

  async function completeLogin() {
    if (!proofRequest || !selectedProfile) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await authApi.completeMockNdiLogin(proofRequest.proofRequestThreadId, selectedProfile.employmentId);
      establishSession(response);
      router.push("/dashboard");
    } catch (loginError) {
      setError(
        loginError instanceof ApiClientError
          ? `${loginError.code}: ${loginError.message}`
          : loginError instanceof Error
            ? loginError.message
            : "Mock NDI login failed."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-8 px-4 py-6 md:px-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)] lg:px-8">
        <section className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Mock Bhutan NDI
            </div>
            <h1 className="mt-8 max-w-2xl text-4xl font-semibold text-slate-950 md:text-5xl">
              e-GP Trust Layer
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              Login with Bhutan NDI to receive a backend-mapped procurement role for the demo workflow.
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">Requested Attributes</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(proofRequest?.requestedAttributes ?? ["Employment ID", "Position", "Employment Type", "Employer"]).map(
                  (attribute) => (
                    <span key={attribute} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {attribute}
                    </span>
                  )
                )}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">Selected Profile</p>
              <p className="mt-3 text-sm font-medium text-slate-700">
                {selectedProfile ? `${selectedProfile.position}, ${selectedProfile.employer}` : "None"}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-5 lg:grid-cols-[180px_minmax(0,1fr)]">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex aspect-square items-center justify-center rounded-md border border-slate-300 bg-white">
                <QrCode className="h-20 w-20 text-slate-700" aria-hidden="true" />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-950">Scan with Bhutan NDI app</p>
              <p className="mt-2 break-all text-xs leading-5 text-slate-500">
                {proofRequest?.deepLinkURL ?? "mock proof request pending"}
              </p>
            </div>

            <div className="min-w-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">Login with Bhutan NDI</h2>
                  <p className="mt-1 text-sm text-slate-600">Mock NDI demo profile</p>
                </div>
                <button
                  type="button"
                  onClick={() => void completeLogin()}
                  disabled={!proofRequest || !selectedProfile || submitting}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  Continue
                </button>
              </div>

              {error ? (
                <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  {error}
                </div>
              ) : null}

              {loading ? (
                <div className="mt-6 flex min-h-48 items-center justify-center rounded-lg border border-dashed border-slate-300">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-500" aria-hidden="true" />
                </div>
              ) : (
                <div className="mt-6 grid gap-3">
                  {profiles.map((profile) => (
                    <NDIIdentityCard
                      key={profile.employmentId}
                      profile={profile}
                      selected={profile.employmentId === selectedEmploymentId}
                      onSelect={() => setSelectedEmploymentId(profile.employmentId)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
