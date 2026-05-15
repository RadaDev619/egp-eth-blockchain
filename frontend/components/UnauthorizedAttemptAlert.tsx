import { CircleAlert } from "lucide-react";

type UnauthorizedAttemptAlertProps = {
  title?: string;
  message: string;
  details?: Array<{ label: string; value: string | null | undefined }>;
};

export function UnauthorizedAttemptAlert({
  title = "Blocked action recorded as audit evidence",
  message,
  details = []
}: UnauthorizedAttemptAlertProps) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-sm leading-6">{message}</p>
          {details.length > 0 ? (
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              {details.map((detail) => (
                <div key={detail.label} className="rounded-md border border-amber-200 bg-white/70 p-2">
                  <dt className="font-medium opacity-80">{detail.label}</dt>
                  <dd className="mt-1 font-semibold">{detail.value ?? "Not available"}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>
    </section>
  );
}
