import { ExternalLink, ShieldCheck } from "lucide-react";

type BlockchainProofCardProps = {
  txHash?: string | null;
  status?: string | null;
  title?: string;
  compact?: boolean;
};

function shortTxHash(txHash: string) {
  return txHash.length > 18 ? `${txHash.slice(0, 10)}...${txHash.slice(-6)}` : txHash;
}

export function BlockchainProofCard({
  txHash,
  status,
  title = "Backend Relayer Proof",
  compact = false
}: BlockchainProofCardProps) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white ${compact ? "p-3" : "p-5"} shadow-sm`}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-800">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">Procurement proof submitted gaslessly by the backend relayer after validation.</p>
          <dl className="mt-3 grid gap-2 text-xs">
            <div>
              <dt className="font-medium text-slate-500">Transaction Hash</dt>
              <dd className="break-all font-semibold text-slate-900">{txHash ? shortTxHash(txHash) : "Not submitted yet"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Confirmation Status</dt>
              <dd className="font-semibold text-slate-900">{status ?? "NOT_SUBMITTED"}</dd>
            </div>
          </dl>
          {txHash && !txHash.startsWith("0xmock") ? (
            <a
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950"
            >
              Explorer Link
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
