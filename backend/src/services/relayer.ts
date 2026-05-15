import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, JsonRpcProvider, Wallet, ethers } from "ethers";
import { env } from "../config/env.js";
import { canonicalJson, sha256Hex } from "../utils/hash.js";
import { AppError, ValidationError } from "../utils/errors.js";

export type BlockchainMode = "mock" | "local" | "sepolia";
export type RelayerStatus = "CONFIRMED" | "PENDING" | "FAILED" | "MOCK_CONFIRMED";

export type RelayerTransactionResult = {
  txHash: string;
  status: RelayerStatus;
  network: BlockchainMode;
  blockNumber?: number | null;
  chainId?: number | null;
  contractAddress?: string | null;
  relayerAddress?: string | null;
  explorerUrl?: string | null;
  mock: boolean;
};

type RelayerBaseInput = {
  tenderId: string;
  actorEmployeeHash: string;
  actorRole: string;
  fromState?: string | null;
  toState?: string | null;
  metadata?: Record<string, unknown>;
};

export type TenderCreatedRelayerInput = RelayerBaseInput & {
  documentHash: string;
  ipfsCid?: string | null;
};

export type TenderVersionCreatedRelayerInput = TenderCreatedRelayerInput & {
  versionNumber: number;
};

export type BidSubmittedRelayerInput = RelayerBaseInput & {
  bidHash: string;
};

export type ApprovalRelayerInput = RelayerBaseInput;

export type TamperingDetectedRelayerInput = RelayerBaseInput & {
  expectedDocumentHash: string;
  observedDocumentHash: string;
};

export type TenderManifestProofRelayerInput = RelayerBaseInput & {
  manifestHash: string;
};

export type ProposalPackageProofRelayerInput = RelayerBaseInput & {
  packageHash: string;
};

export type ProposalEnvelopeProofRelayerInput = RelayerBaseInput & {
  envelopeType: string;
  envelopeManifestHash: string;
};

export type TenderClosedProofRelayerInput = RelayerBaseInput & {
  closureHash: string;
};

export type KeyReleaseProofRelayerInput = RelayerBaseInput & {
  envelopeType: string;
  keyReleaseHash: string;
};

export type EvaluationReportProofRelayerInput = RelayerBaseInput & {
  reportHash: string;
};

export type AwardRecommendedProofRelayerInput = RelayerBaseInput & {
  recommendationHash: string;
};

export type AwardApprovedProofRelayerInput = RelayerBaseInput & {
  approvalHash: string;
};

export type ContractHashCommittedRelayerInput = RelayerBaseInput & {
  contractHash: string;
};

type DeploymentArtifact = {
  chainId?: number;
  relayerAddress?: string;
  contracts?: {
    roleManager?: { address?: string };
    auditLog?: { address?: string };
    tenderRegistry?: { address?: string };
    approvalManager?: { address?: string };
  };
};

type ContractAddresses = {
  roleManagerAddress?: string;
  tenderRegistryAddress: string;
  approvalManagerAddress: string;
  auditLogAddress: string;
};

type SubmitInput = {
  contractName: keyof Pick<ContractAddresses, "tenderRegistryAddress" | "approvalManagerAddress" | "auditLogAddress">;
  abi: readonly string[];
  functionName: string;
  args: unknown[];
  mockAction: string;
  mockPayload: unknown;
};

const tenderRegistryAbi = [
  "function recordTenderCreated(string tenderId, bytes32 actorEmployeeHash, string actorRole, bytes32 documentHash, string ipfsCid, bytes32 metadataHash)",
  "function recordTenderVersionCreated(string tenderId, uint256 versionNumber, bytes32 actorEmployeeHash, string actorRole, bytes32 documentHash, string ipfsCid, bytes32 metadataHash)",
  "function recordBidSubmitted(string tenderId, bytes32 actorEmployeeHash, string actorRole, bytes32 bidHash, bytes32 metadataHash)"
] as const;

const approvalManagerAbi = [
  "function recordEvaluationApproved(string tenderId, bytes32 actorEmployeeHash, string actorRole, string fromState, string toState, bytes32 metadataHash)",
  "function recordPaymentApproved(string tenderId, bytes32 actorEmployeeHash, string actorRole, string fromState, string toState, bytes32 metadataHash)"
] as const;

const auditLogAbi = [
  "function recordTamperingDetected(string tenderId, bytes32 actorEmployeeHash, string actorRole, bytes32 expectedDocumentHash, bytes32 observedDocumentHash, bytes32 metadataHash)",
  "function recordTenderManifestCommitted(string tenderId, bytes32 actorEmployeeHash, string actorRole, bytes32 manifestHash, bytes32 metadataHash)",
  "function recordTenderPublished(string tenderId, bytes32 actorEmployeeHash, string actorRole, bytes32 manifestHash, bytes32 metadataHash)",
  "function recordProposalPackageSubmitted(string tenderId, bytes32 actorEmployeeHash, string actorRole, bytes32 packageHash, bytes32 metadataHash)",
  "function recordProposalEnvelopeCommitted(string tenderId, bytes32 actorEmployeeHash, string actorRole, string envelopeType, bytes32 envelopeManifestHash, bytes32 metadataHash)",
  "function recordTenderClosed(string tenderId, bytes32 actorEmployeeHash, string actorRole, bytes32 closureHash, bytes32 metadataHash)",
  "function recordKeyReleaseLogged(string tenderId, bytes32 actorEmployeeHash, string actorRole, string envelopeType, bytes32 keyReleaseHash, bytes32 metadataHash)",
  "function recordEvaluationReportCommitted(string tenderId, bytes32 actorEmployeeHash, string actorRole, bytes32 reportHash, bytes32 metadataHash)",
  "function recordAwardRecommended(string tenderId, bytes32 actorEmployeeHash, string actorRole, bytes32 recommendationHash, bytes32 metadataHash)",
  "function recordAwardApproved(string tenderId, bytes32 actorEmployeeHash, string actorRole, bytes32 approvalHash, bytes32 metadataHash)",
  "function recordContractHashCommitted(string tenderId, bytes32 actorEmployeeHash, string actorRole, bytes32 contractHash, bytes32 metadataHash)"
] as const;

export class RelayerConfigError extends AppError {
  constructor(message: string, details?: unknown) {
    super(500, "RELAYER_CONFIG_ERROR", message, details);
  }
}

export class RelayerTransactionError extends AppError {
  constructor(message = "Blockchain relayer transaction failed.", details?: unknown) {
    super(502, "RELAYER_TRANSACTION_ERROR", message, details);
  }
}

function validateRequiredString(name: string, value: string | null | undefined) {
  if (!value?.trim()) {
    throw new ValidationError(`${name} is required for blockchain audit proof.`);
  }
}

function normalizeMetadata(input: RelayerBaseInput, action: string, extra: Record<string, unknown> = {}) {
  return {
    tenderId: input.tenderId,
    action,
    actorEmployeeHash: input.actorEmployeeHash,
    actorRole: input.actorRole,
    fromState: input.fromState ?? null,
    toState: input.toState ?? null,
    ...extra,
    ...(input.metadata ?? {})
  };
}

function metadataHash(input: RelayerBaseInput, action: string, extra: Record<string, unknown> = {}) {
  return hexBytes32(`metadata:${canonicalJson(normalizeMetadata(input, action, extra))}`);
}

function hexBytes32(value: string): string {
  return `0x${sha256Hex(value)}`;
}

function toBytes32(name: string, value: string, options: { hashIfNotBytes32?: boolean } = {}) {
  validateRequiredString(name, value);

  if (ethers.isHexString(value, 32)) {
    return value;
  }

  if (env.BLOCKCHAIN_MODE === "mock") {
    return hexBytes32(value);
  }

  if (options.hashIfNotBytes32) {
    return hexBytes32(value);
  }

  throw new ValidationError(`${name} must be a 32-byte hex string.`);
}

function validateBaseInput(input: RelayerBaseInput) {
  validateRequiredString("tenderId", input.tenderId);
  validateRequiredString("actorEmployeeHash", input.actorEmployeeHash);
  validateRequiredString("actorRole", input.actorRole);
}

function safeErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }

  return { message: "Unknown relayer error." };
}

function deploymentArtifactPath(mode: BlockchainMode) {
  const fileName = mode === "sepolia" ? "sepolia.json" : "local.json";
  const currentFile = fileURLToPath(import.meta.url);
  const candidates = [
    path.resolve(process.cwd(), "..", "contracts", "deployments", fileName),
    path.resolve(process.cwd(), "contracts", "deployments", fileName),
    path.resolve(path.dirname(currentFile), "..", "..", "..", "..", "contracts", "deployments", fileName)
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

function readDeploymentArtifact(mode: BlockchainMode): DeploymentArtifact | null {
  const artifactPath = deploymentArtifactPath(mode);
  if (!artifactPath) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(artifactPath, "utf8")) as DeploymentArtifact;
  } catch {
    throw new RelayerConfigError("Unable to read blockchain deployment artifact.");
  }
}

function addressFromEnvOrArtifact(envAddress: string | undefined, artifactAddress: string | undefined, name: string) {
  const address = envAddress?.trim() || artifactAddress?.trim();
  if (!address || !ethers.isAddress(address)) {
    throw new RelayerConfigError(`${name} must be a valid deployed contract address.`);
  }

  return address;
}

function loadContractAddresses(mode: BlockchainMode): ContractAddresses {
  const artifact = readDeploymentArtifact(mode);

  return {
    roleManagerAddress: env.ROLE_MANAGER_ADDRESS || artifact?.contracts?.roleManager?.address,
    tenderRegistryAddress: addressFromEnvOrArtifact(
      env.TENDER_REGISTRY_ADDRESS,
      artifact?.contracts?.tenderRegistry?.address,
      "TENDER_REGISTRY_ADDRESS"
    ),
    approvalManagerAddress: addressFromEnvOrArtifact(
      env.APPROVAL_MANAGER_ADDRESS,
      artifact?.contracts?.approvalManager?.address,
      "APPROVAL_MANAGER_ADDRESS"
    ),
    auditLogAddress: addressFromEnvOrArtifact(env.AUDIT_LOG_ADDRESS, artifact?.contracts?.auditLog?.address, "AUDIT_LOG_ADDRESS")
  };
}

function rpcUrlFor(mode: BlockchainMode) {
  if (mode === "local") {
    return env.LOCAL_RPC_URL;
  }

  if (!env.SEPOLIA_RPC_URL) {
    throw new RelayerConfigError("SEPOLIA_RPC_URL is required when BLOCKCHAIN_MODE=sepolia.");
  }

  return env.SEPOLIA_RPC_URL;
}

async function createEvmContext() {
  const mode = env.BLOCKCHAIN_MODE;
  if (mode === "mock") {
    throw new RelayerConfigError("EVM context is not available in mock blockchain mode.");
  }

  if (!env.RELAYER_PRIVATE_KEY) {
    throw new RelayerConfigError("RELAYER_PRIVATE_KEY is required outside mock blockchain mode.");
  }

  const provider = new JsonRpcProvider(rpcUrlFor(mode));
  const wallet = new Wallet(env.RELAYER_PRIVATE_KEY, provider);
  const addresses = loadContractAddresses(mode);
  const chain = await provider.getNetwork();
  const confirmations = Math.max(1, env.TX_CONFIRMATIONS);

  return {
    mode,
    provider,
    wallet,
    relayerAddress: wallet.address,
    addresses,
    chainId: Number(chain.chainId),
    confirmations
  };
}

function deterministicMockResult(action: string, payload: unknown): RelayerTransactionResult {
  const txHash = `0xmock${sha256Hex(canonicalJson({ action, payload })).slice(0, 58)}`;

  return {
    txHash,
    status: "MOCK_CONFIRMED",
    network: "mock",
    blockNumber: 0,
    chainId: 31337,
    contractAddress: "mock-contract",
    relayerAddress: "mock-relayer",
    explorerUrl: null,
    mock: true
  };
}

async function submitTransaction(input: SubmitInput): Promise<RelayerTransactionResult> {
  if (env.BLOCKCHAIN_MODE === "mock") {
    return deterministicMockResult(input.mockAction, input.mockPayload);
  }

  try {
    const context = await createEvmContext();
    const contractAddress = context.addresses[input.contractName];
    const contract = new Contract(contractAddress, input.abi, context.wallet);
    const tx = await contract.getFunction(input.functionName)(...input.args);
    const receipt = await tx.wait(context.confirmations);
    const status: RelayerStatus = receipt?.status === 1 ? "CONFIRMED" : "FAILED";

    return {
      txHash: tx.hash,
      status,
      network: context.mode,
      blockNumber: receipt?.blockNumber ?? null,
      chainId: context.chainId,
      contractAddress,
      relayerAddress: context.relayerAddress,
      explorerUrl: getExplorerUrl(tx.hash),
      mock: false
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new RelayerTransactionError("Blockchain relayer transaction failed.", safeErrorDetails(error));
  }
}

export async function recordTenderCreated(input: TenderCreatedRelayerInput) {
  validateBaseInput(input);
  validateRequiredString("documentHash", input.documentHash);
  const action = "TENDER_CREATED";

  return submitTransaction({
    contractName: "tenderRegistryAddress",
    abi: tenderRegistryAbi,
    functionName: "recordTenderCreated",
    args: [
      input.tenderId,
      toBytes32("actorEmployeeHash", input.actorEmployeeHash),
      input.actorRole,
      toBytes32("documentHash", input.documentHash, { hashIfNotBytes32: true }),
      input.ipfsCid ?? "",
      metadataHash(input, action, { documentHash: input.documentHash, ipfsCid: input.ipfsCid ?? null })
    ],
    mockAction: action,
    mockPayload: normalizeMetadata(input, action, { documentHash: input.documentHash, ipfsCid: input.ipfsCid ?? null })
  });
}

export async function recordTenderVersionCreated(input: TenderVersionCreatedRelayerInput) {
  validateBaseInput(input);
  validateRequiredString("documentHash", input.documentHash);
  if (!Number.isInteger(input.versionNumber) || input.versionNumber < 1) {
    throw new ValidationError("versionNumber must be a positive integer.");
  }
  const action = "TENDER_VERSION_CREATED";

  return submitTransaction({
    contractName: "tenderRegistryAddress",
    abi: tenderRegistryAbi,
    functionName: "recordTenderVersionCreated",
    args: [
      input.tenderId,
      input.versionNumber,
      toBytes32("actorEmployeeHash", input.actorEmployeeHash),
      input.actorRole,
      toBytes32("documentHash", input.documentHash, { hashIfNotBytes32: true }),
      input.ipfsCid ?? "",
      metadataHash(input, action, {
        versionNumber: input.versionNumber,
        documentHash: input.documentHash,
        ipfsCid: input.ipfsCid ?? null
      })
    ],
    mockAction: action,
    mockPayload: normalizeMetadata(input, action, {
      versionNumber: input.versionNumber,
      documentHash: input.documentHash,
      ipfsCid: input.ipfsCid ?? null
    })
  });
}

export async function recordBidSubmitted(input: BidSubmittedRelayerInput) {
  validateBaseInput(input);
  validateRequiredString("bidHash", input.bidHash);
  const action = "BID_SUBMITTED";

  return submitTransaction({
    contractName: "tenderRegistryAddress",
    abi: tenderRegistryAbi,
    functionName: "recordBidSubmitted",
    args: [
      input.tenderId,
      toBytes32("actorEmployeeHash", input.actorEmployeeHash),
      input.actorRole,
      toBytes32("bidHash", input.bidHash, { hashIfNotBytes32: true }),
      metadataHash(input, action, { bidHash: input.bidHash })
    ],
    mockAction: action,
    mockPayload: normalizeMetadata(input, action, { bidHash: input.bidHash })
  });
}

export async function recordEvaluationApproved(input: ApprovalRelayerInput) {
  validateBaseInput(input);
  const action = "EVALUATION_APPROVED";

  return submitTransaction({
    contractName: "approvalManagerAddress",
    abi: approvalManagerAbi,
    functionName: "recordEvaluationApproved",
    args: [
      input.tenderId,
      toBytes32("actorEmployeeHash", input.actorEmployeeHash),
      input.actorRole,
      input.fromState ?? "",
      input.toState ?? "",
      metadataHash(input, action)
    ],
    mockAction: action,
    mockPayload: normalizeMetadata(input, action)
  });
}

export async function recordPaymentApproved(input: ApprovalRelayerInput) {
  validateBaseInput(input);
  const action = "PAYMENT_APPROVED";

  return submitTransaction({
    contractName: "approvalManagerAddress",
    abi: approvalManagerAbi,
    functionName: "recordPaymentApproved",
    args: [
      input.tenderId,
      toBytes32("actorEmployeeHash", input.actorEmployeeHash),
      input.actorRole,
      input.fromState ?? "",
      input.toState ?? "",
      metadataHash(input, action)
    ],
    mockAction: action,
    mockPayload: normalizeMetadata(input, action)
  });
}

export async function recordTamperingDetected(input: TamperingDetectedRelayerInput) {
  validateBaseInput(input);
  validateRequiredString("expectedDocumentHash", input.expectedDocumentHash);
  validateRequiredString("observedDocumentHash", input.observedDocumentHash);
  const action = "TAMPERING_DETECTED";

  return submitTransaction({
    contractName: "auditLogAddress",
    abi: auditLogAbi,
    functionName: "recordTamperingDetected",
    args: [
      input.tenderId,
      toBytes32("actorEmployeeHash", input.actorEmployeeHash),
      input.actorRole,
      toBytes32("expectedDocumentHash", input.expectedDocumentHash, { hashIfNotBytes32: true }),
      toBytes32("observedDocumentHash", input.observedDocumentHash, { hashIfNotBytes32: true }),
      metadataHash(input, action, {
        expectedDocumentHash: input.expectedDocumentHash,
        observedDocumentHash: input.observedDocumentHash
      })
    ],
    mockAction: action,
    mockPayload: normalizeMetadata(input, action, {
      expectedDocumentHash: input.expectedDocumentHash,
      observedDocumentHash: input.observedDocumentHash
    })
  });
}

function lifecycleArgs(input: RelayerBaseInput, action: string, extra: Record<string, unknown>, subjectName: string, subjectValue: string) {
  return [
    input.tenderId,
    toBytes32("actorEmployeeHash", input.actorEmployeeHash),
    input.actorRole,
    toBytes32(subjectName, subjectValue, { hashIfNotBytes32: true }),
    metadataHash(input, action, extra)
  ];
}

export async function recordTenderManifestCommitted(input: TenderManifestProofRelayerInput) {
  validateBaseInput(input);
  validateRequiredString("manifestHash", input.manifestHash);
  const action = "TENDER_MANIFEST_COMMITTED";
  const extra = { manifestHash: input.manifestHash };

  return submitTransaction({
    contractName: "auditLogAddress",
    abi: auditLogAbi,
    functionName: "recordTenderManifestCommitted",
    args: lifecycleArgs(input, action, extra, "manifestHash", input.manifestHash),
    mockAction: action,
    mockPayload: normalizeMetadata(input, action, extra)
  });
}

export async function recordTenderPublished(input: TenderManifestProofRelayerInput) {
  validateBaseInput(input);
  validateRequiredString("manifestHash", input.manifestHash);
  const action = "TENDER_PUBLISHED";
  const extra = { manifestHash: input.manifestHash };

  return submitTransaction({
    contractName: "auditLogAddress",
    abi: auditLogAbi,
    functionName: "recordTenderPublished",
    args: lifecycleArgs(input, action, extra, "manifestHash", input.manifestHash),
    mockAction: action,
    mockPayload: normalizeMetadata(input, action, extra)
  });
}

export async function recordProposalPackageSubmitted(input: ProposalPackageProofRelayerInput) {
  validateBaseInput(input);
  validateRequiredString("packageHash", input.packageHash);
  const action = "PROPOSAL_PACKAGE_SUBMITTED";
  const extra = { packageHash: input.packageHash };

  return submitTransaction({
    contractName: "auditLogAddress",
    abi: auditLogAbi,
    functionName: "recordProposalPackageSubmitted",
    args: lifecycleArgs(input, action, extra, "packageHash", input.packageHash),
    mockAction: action,
    mockPayload: normalizeMetadata(input, action, extra)
  });
}

export async function recordProposalEnvelopeCommitted(input: ProposalEnvelopeProofRelayerInput) {
  validateBaseInput(input);
  validateRequiredString("envelopeType", input.envelopeType);
  validateRequiredString("envelopeManifestHash", input.envelopeManifestHash);
  const action = "PROPOSAL_ENVELOPE_COMMITTED";
  const extra = {
    envelopeType: input.envelopeType,
    envelopeManifestHash: input.envelopeManifestHash
  };

  return submitTransaction({
    contractName: "auditLogAddress",
    abi: auditLogAbi,
    functionName: "recordProposalEnvelopeCommitted",
    args: [
      input.tenderId,
      toBytes32("actorEmployeeHash", input.actorEmployeeHash),
      input.actorRole,
      input.envelopeType,
      toBytes32("envelopeManifestHash", input.envelopeManifestHash, { hashIfNotBytes32: true }),
      metadataHash(input, action, extra)
    ],
    mockAction: action,
    mockPayload: normalizeMetadata(input, action, extra)
  });
}

export async function recordTenderClosed(input: TenderClosedProofRelayerInput) {
  validateBaseInput(input);
  validateRequiredString("closureHash", input.closureHash);
  const action = "TENDER_CLOSED";
  const extra = { closureHash: input.closureHash };

  return submitTransaction({
    contractName: "auditLogAddress",
    abi: auditLogAbi,
    functionName: "recordTenderClosed",
    args: lifecycleArgs(input, action, extra, "closureHash", input.closureHash),
    mockAction: action,
    mockPayload: normalizeMetadata(input, action, extra)
  });
}

export async function recordKeyReleaseLogged(input: KeyReleaseProofRelayerInput) {
  validateBaseInput(input);
  validateRequiredString("envelopeType", input.envelopeType);
  validateRequiredString("keyReleaseHash", input.keyReleaseHash);
  const action = "KEY_RELEASE_LOGGED";
  const extra = {
    envelopeType: input.envelopeType,
    keyReleaseHash: input.keyReleaseHash
  };

  return submitTransaction({
    contractName: "auditLogAddress",
    abi: auditLogAbi,
    functionName: "recordKeyReleaseLogged",
    args: [
      input.tenderId,
      toBytes32("actorEmployeeHash", input.actorEmployeeHash),
      input.actorRole,
      input.envelopeType,
      toBytes32("keyReleaseHash", input.keyReleaseHash, { hashIfNotBytes32: true }),
      metadataHash(input, action, extra)
    ],
    mockAction: action,
    mockPayload: normalizeMetadata(input, action, extra)
  });
}

export async function recordEvaluationReportCommitted(input: EvaluationReportProofRelayerInput) {
  validateBaseInput(input);
  validateRequiredString("reportHash", input.reportHash);
  const action = "EVALUATION_REPORT_COMMITTED";
  const extra = { reportHash: input.reportHash };

  return submitTransaction({
    contractName: "auditLogAddress",
    abi: auditLogAbi,
    functionName: "recordEvaluationReportCommitted",
    args: lifecycleArgs(input, action, extra, "reportHash", input.reportHash),
    mockAction: action,
    mockPayload: normalizeMetadata(input, action, extra)
  });
}

export async function recordAwardRecommended(input: AwardRecommendedProofRelayerInput) {
  validateBaseInput(input);
  validateRequiredString("recommendationHash", input.recommendationHash);
  const action = "AWARD_RECOMMENDED";
  const extra = { recommendationHash: input.recommendationHash };

  return submitTransaction({
    contractName: "auditLogAddress",
    abi: auditLogAbi,
    functionName: "recordAwardRecommended",
    args: lifecycleArgs(input, action, extra, "recommendationHash", input.recommendationHash),
    mockAction: action,
    mockPayload: normalizeMetadata(input, action, extra)
  });
}

export async function recordAwardApproved(input: AwardApprovedProofRelayerInput) {
  validateBaseInput(input);
  validateRequiredString("approvalHash", input.approvalHash);
  const action = "AWARD_APPROVED";
  const extra = { approvalHash: input.approvalHash };

  return submitTransaction({
    contractName: "auditLogAddress",
    abi: auditLogAbi,
    functionName: "recordAwardApproved",
    args: lifecycleArgs(input, action, extra, "approvalHash", input.approvalHash),
    mockAction: action,
    mockPayload: normalizeMetadata(input, action, extra)
  });
}

export async function recordContractHashCommitted(input: ContractHashCommittedRelayerInput) {
  validateBaseInput(input);
  validateRequiredString("contractHash", input.contractHash);
  const action = "CONTRACT_HASH_COMMITTED";
  const extra = { contractHash: input.contractHash };

  return submitTransaction({
    contractName: "auditLogAddress",
    abi: auditLogAbi,
    functionName: "recordContractHashCommitted",
    args: lifecycleArgs(input, action, extra, "contractHash", input.contractHash),
    mockAction: action,
    mockPayload: normalizeMetadata(input, action, extra)
  });
}

export async function getTransactionStatus(txHash: string): Promise<RelayerTransactionResult> {
  validateRequiredString("txHash", txHash);

  if (txHash.startsWith("0xmock") || env.BLOCKCHAIN_MODE === "mock") {
    return {
      txHash,
      status: "MOCK_CONFIRMED",
      network: "mock",
      blockNumber: 0,
      chainId: 31337,
      contractAddress: "mock-contract",
      relayerAddress: "mock-relayer",
      explorerUrl: null,
      mock: true
    };
  }

  const mode = env.BLOCKCHAIN_MODE;
  const provider = new JsonRpcProvider(rpcUrlFor(mode));
  const [receipt, chain] = await Promise.all([provider.getTransactionReceipt(txHash), provider.getNetwork()]);
  const status: RelayerStatus = !receipt ? "PENDING" : receipt.status === 1 ? "CONFIRMED" : "FAILED";

  return {
    txHash,
    status,
    network: mode,
    blockNumber: receipt?.blockNumber ?? null,
    chainId: Number(chain.chainId),
    explorerUrl: getExplorerUrl(txHash),
    mock: false
  };
}

export function getExplorerUrl(txHash: string) {
  if (!txHash || txHash.startsWith("0xmock") || env.BLOCKCHAIN_MODE !== "sepolia") {
    return null;
  }

  const baseUrl = env.ETHERSCAN_BASE_URL.endsWith("/") ? env.ETHERSCAN_BASE_URL : `${env.ETHERSCAN_BASE_URL}/`;
  return `${baseUrl}${txHash}`;
}
