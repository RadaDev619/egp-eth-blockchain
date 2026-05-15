"use client";

import { BarChart3 } from "lucide-react";
import { WorkspacePlaceholder } from "@/components/WorkspacePlaceholder";

export default function ProofsPage() {
  return (
    <WorkspacePlaceholder
      title="Blockchain Proofs"
      eyebrow="Backend Relayer"
      summary="Validated procurement actions will show transaction hashes and confirmation status."
      icon={BarChart3}
    />
  );
}
