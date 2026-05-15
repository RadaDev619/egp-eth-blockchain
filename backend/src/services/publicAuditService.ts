import type { AuditLog, BlockchainTransaction, PublicAuditProof, PublicAuditProofType, Tender } from "@prisma/client";
import { NotFoundError } from "../utils/errors.js";
import { prisma } from "../utils/prisma.js";

export type PublicAuditFilters = {
  tenderId?: string;
  proofType?: PublicAuditProofType;
  txHash?: string;
};

type TenderSummary = Pick<Tender, "id" | "tenderCode" | "agency" | "currentState" | "createdAt" | "updatedAt">;

function shortTender(tender: TenderSummary | null | undefined) {
  if (!tender) {
    return null;
  }

  return {
    id: tender.id,
    tenderCode: tender.tenderCode,
    agency: tender.agency,
    currentState: tender.currentState,
    createdAt: tender.createdAt,
    updatedAt: tender.updatedAt
  };
}

function publicProof(proof: PublicAuditProof & { tender?: TenderSummary | null }) {
  return {
    id: proof.id,
    tenderId: proof.tenderId,
    tender: shortTender(proof.tender),
    proofType: proof.proofType,
    proofHash: proof.proofHash,
    sourceTxHash: proof.sourceTxHash,
    blockchainStatus: proof.blockchainStatus,
    publicLabel: proof.publicLabel,
    createdAt: proof.createdAt
  };
}

function publicAuditEvent(event: AuditLog) {
  return {
    id: event.id,
    source: "AUDIT_LOG" as const,
    tenderId: event.tenderId,
    action: event.action,
    status: event.status,
    actorRole: event.actorRole,
    fromState: event.fromState,
    toState: event.toState,
    rejectionReason: event.status === "BLOCKED" ? event.rejectionReason : null,
    documentHash: event.documentHash,
    metadataHash: event.metadataHash,
    txHash: event.txHash,
    blockchainStatus: event.blockchainStatus,
    blockNumber: event.blockNumber,
    chainId: event.chainId,
    createdAt: event.createdAt,
    timestamp: event.createdAt
  };
}

function publicProofEvent(proof: PublicAuditProof) {
  const status =
    proof.blockchainStatus === "MOCK_CONFIRMED"
      ? "MOCK_CHAIN_CONFIRMED"
      : proof.blockchainStatus === "FAILED"
        ? "CHAIN_FAILED"
        : proof.blockchainStatus
          ? "CHAIN_CONFIRMED"
          : "SUCCESS";

  return {
    id: proof.id,
    source: "PUBLIC_PROOF" as const,
    tenderId: proof.tenderId,
    action: proof.proofType,
    status,
    actorRole: null,
    fromState: null,
    toState: null,
    rejectionReason: null,
    documentHash: proof.proofHash,
    metadataHash: null,
    txHash: proof.sourceTxHash,
    blockchainStatus: proof.blockchainStatus,
    blockNumber: null,
    chainId: null,
    publicLabel: proof.publicLabel,
    createdAt: proof.createdAt,
    timestamp: proof.createdAt
  };
}

function publicBlockchainTransaction(transaction: BlockchainTransaction) {
  return {
    id: transaction.id,
    txHash: transaction.txHash,
    network: transaction.network,
    chainId: transaction.chainId,
    action: transaction.action,
    resourceType: transaction.resourceType,
    tenderId: transaction.tenderId,
    status: transaction.status,
    blockNumber: transaction.blockNumber,
    explorerUrl: transaction.explorerUrl,
    createdAt: transaction.createdAt,
    confirmedAt: transaction.confirmedAt
  };
}

function timelineSort<T extends { createdAt: Date }>(items: T[]) {
  return [...items].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

function proofWhere(filters: PublicAuditFilters) {
  return {
    tenderId: filters.tenderId,
    proofType: filters.proofType,
    sourceTxHash: filters.txHash
  };
}

export async function getPublicAuditOverview(filters: PublicAuditFilters = {}) {
  const [proofs, tenders] = await Promise.all([
    prisma.publicAuditProof.findMany({
      where: proofWhere(filters),
      orderBy: { createdAt: "asc" },
      take: 500,
      include: {
        tender: {
          select: {
            id: true,
            tenderCode: true,
            agency: true,
            currentState: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    }),
    prisma.tender.findMany({
      where: filters.tenderId
        ? { id: filters.tenderId, publicAuditProofs: { some: {} } }
        : { publicAuditProofs: { some: {} } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        tenderCode: true,
        agency: true,
        currentState: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            publicAuditProofs: true
          }
        }
      }
    })
  ]);

  return {
    tenders: tenders.map((tender) => ({
      id: tender.id,
      tenderCode: tender.tenderCode,
      agency: tender.agency,
      currentState: tender.currentState,
      createdAt: tender.createdAt,
      updatedAt: tender.updatedAt,
      proofCount: tender._count.publicAuditProofs
    })),
    proofs: proofs.map(publicProof),
    timeline: timelineSort(proofs).map(publicProofEvent)
  };
}

export async function getPublicTenderAudit(tenderId: string) {
  const [tender, proofs, events, transactions] = await Promise.all([
    prisma.tender.findUnique({
      where: { id: tenderId },
      select: {
        id: true,
        tenderCode: true,
        agency: true,
        currentState: true,
        createdAt: true,
        updatedAt: true
      }
    }),
    prisma.publicAuditProof.findMany({
      where: { tenderId },
      orderBy: { createdAt: "asc" },
      take: 500
    }),
    prisma.auditLog.findMany({
      where: { tenderId },
      orderBy: { createdAt: "asc" },
      take: 500
    }),
    prisma.blockchainTransaction.findMany({
      where: { tenderId },
      orderBy: { createdAt: "asc" },
      take: 200
    })
  ]);

  if (!tender || proofs.length === 0) {
    throw new NotFoundError("Public audit proof trail was not found for this tender.");
  }

  return {
    tender: shortTender(tender),
    proofs: proofs.map(publicProof),
    blockchainTransactions: transactions.map(publicBlockchainTransaction),
    timeline: timelineSort([...proofs.map(publicProofEvent), ...events.map(publicAuditEvent)])
  };
}

export async function getPublicTransactionAudit(txHash: string) {
  const [proofs, events, transaction] = await Promise.all([
    prisma.publicAuditProof.findMany({
      where: { sourceTxHash: txHash },
      orderBy: { createdAt: "asc" },
      take: 50
    }),
    prisma.auditLog.findMany({
      where: { txHash },
      orderBy: { createdAt: "asc" },
      take: 50
    }),
    prisma.blockchainTransaction.findUnique({
      where: { txHash }
    })
  ]);

  if (proofs.length === 0 && events.length === 0 && !transaction) {
    throw new NotFoundError("Public transaction proof was not found.");
  }

  return {
    txHash,
    blockchainTransaction: transaction ? publicBlockchainTransaction(transaction) : null,
    proofs: proofs.map(publicProof),
    timeline: timelineSort([...proofs.map(publicProofEvent), ...events.map(publicAuditEvent)])
  };
}
