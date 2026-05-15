import { AlertTriangle, CheckCircle2, FileCheck2 } from "lucide-react";

type DocumentHashCardProps = {
  expectedHash?: string | null;
  uploadedHash?: string | null;
  verified?: boolean;
  tamperingDetected?: boolean;
  ipfsCid?: string | null;
};

function hashPreview(hash?: string | null) {
  if (!hash) {
    return "Not available";
  }

  return hash.length > 28 ? `${hash.slice(0, 16)}...${hash.slice(-10)}` : hash;
}

export function DocumentHashCard({
  expectedHash,
  uploadedHash,
  verified,
  tamperingDetected,
  ipfsCid
}: DocumentHashCardProps) {
  const Icon = tamperingDetected ? AlertTriangle : verified ? CheckCircle2 : FileCheck2;
  const tone = tamperingDetected
    ? "border-rose-200 bg-rose-50 text-rose-950"
    : verified
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : "border-slate-200 bg-white text-slate-950";

  return (
    <section className={`rounded-lg border p-5 shadow-sm ${tone}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">
            {tamperingDetected ? "TAMPERING DETECTED" : verified ? "Document matches recorded version" : "Document hash comparison"}
          </h2>
          <p className="mt-1 text-sm leading-6 opacity-85">
            The backend computes the uploaded PDF hash and compares it with the stored tender version hash.
          </p>
          <dl className="mt-4 grid gap-3 text-xs md:grid-cols-2">
            <div className="rounded-md border border-current/15 bg-white/70 p-3">
              <dt className="font-medium opacity-75">Expected Hash</dt>
              <dd className="mt-1 break-all font-semibold">{hashPreview(expectedHash)}</dd>
            </div>
            <div className="rounded-md border border-current/15 bg-white/70 p-3">
              <dt className="font-medium opacity-75">Uploaded Hash</dt>
              <dd className="mt-1 break-all font-semibold">{hashPreview(uploadedHash)}</dd>
            </div>
            <div className="rounded-md border border-current/15 bg-white/70 p-3 md:col-span-2">
              <dt className="font-medium opacity-75">Stored Evidence CID</dt>
              <dd className="mt-1 break-all font-semibold">{ipfsCid ?? "No CID recorded"}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
