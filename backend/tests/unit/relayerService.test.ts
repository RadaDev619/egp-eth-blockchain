import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actorEmployeeHash = `0x${"1".repeat(64)}`;
const documentHash = `0x${"2".repeat(64)}`;
const bidHash = `0x${"3".repeat(64)}`;
const envelopeManifestHash = `0x${"6".repeat(64)}`;
const keyReleaseHash = `0x${"7".repeat(64)}`;
const validAddress = "0x0000000000000000000000000000000000000001";
const validPrivateKey = `0x${"4".repeat(64)}`;

async function importRelayer() {
  vi.resetModules();
  return import("../../src/services/relayer.js");
}

describe("gasless backend relayer", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("BLOCKCHAIN_MODE", "mock");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns deterministic mock tx hashes without requiring a private key", async () => {
    const { recordTenderCreated } = await importRelayer();
    const input = {
      tenderId: "tender-1",
      actorEmployeeHash,
      actorRole: "PROCUREMENT_OFFICER",
      fromState: null,
      toState: "CREATED",
      documentHash,
      ipfsCid: "ipfs://doc-v1",
      metadata: {
        versionNumber: 1
      }
    };

    const first = await recordTenderCreated(input);
    const second = await recordTenderCreated(input);

    expect(first).toMatchObject({
      txHash: second.txHash,
      status: "MOCK_CONFIRMED",
      network: "mock",
      contractAddress: "mock-contract",
      relayerAddress: "mock-relayer",
      mock: true
    });
    expect(first.txHash).toMatch(/^0xmock[0-9a-f]{58}$/);
  });

  it("supports fixed business relayer methods and no generic contract caller", async () => {
    const relayer = await importRelayer();

    expect(relayer).toHaveProperty("recordTenderCreated");
    expect(relayer).toHaveProperty("recordTenderVersionCreated");
    expect(relayer).toHaveProperty("recordBidSubmitted");
    expect(relayer).toHaveProperty("recordEvaluationApproved");
    expect(relayer).toHaveProperty("recordPaymentApproved");
    expect(relayer).toHaveProperty("recordTamperingDetected");
    expect(relayer).toHaveProperty("recordTenderManifestCommitted");
    expect(relayer).toHaveProperty("recordTenderPublished");
    expect(relayer).toHaveProperty("recordProposalPackageSubmitted");
    expect(relayer).toHaveProperty("recordProposalEnvelopeCommitted");
    expect(relayer).toHaveProperty("recordTenderClosed");
    expect(relayer).toHaveProperty("recordKeyReleaseLogged");
    expect(relayer).toHaveProperty("recordEvaluationReportCommitted");
    expect(relayer).toHaveProperty("recordAwardRecommended");
    expect(relayer).toHaveProperty("recordAwardApproved");
    expect(relayer).toHaveProperty("recordContractHashCommitted");
    expect(relayer).toHaveProperty("getTransactionStatus");
    expect(relayer).toHaveProperty("getExplorerUrl");
    expect(relayer).not.toHaveProperty("callContract");
    expect(relayer).not.toHaveProperty("callRelayerContract");
  });

  it("returns deterministic mock tx hashes for expanded lifecycle proof methods", async () => {
    const { recordProposalEnvelopeCommitted, recordKeyReleaseLogged } = await importRelayer();
    const envelopeInput = {
      tenderId: "tender-1",
      actorEmployeeHash,
      actorRole: "VENDOR",
      envelopeType: "FINANCIAL",
      envelopeManifestHash,
      metadata: {
        proposalEnvelopeId: "envelope-1"
      }
    };
    const keyReleaseInput = {
      tenderId: "tender-1",
      actorEmployeeHash,
      actorRole: "TEC_CHAIR",
      envelopeType: "FINANCIAL",
      keyReleaseHash,
      metadata: {
        keyReleaseRequestId: "key-request-1"
      }
    };

    const firstEnvelope = await recordProposalEnvelopeCommitted(envelopeInput);
    const secondEnvelope = await recordProposalEnvelopeCommitted(envelopeInput);
    const keyRelease = await recordKeyReleaseLogged(keyReleaseInput);

    expect(firstEnvelope).toMatchObject({
      txHash: secondEnvelope.txHash,
      status: "MOCK_CONFIRMED",
      network: "mock",
      contractAddress: "mock-contract",
      relayerAddress: "mock-relayer",
      mock: true
    });
    expect(firstEnvelope.txHash).toMatch(/^0xmock[0-9a-f]{58}$/);
    expect(keyRelease.txHash).toMatch(/^0xmock[0-9a-f]{58}$/);
    expect(keyRelease.txHash).not.toBe(firstEnvelope.txHash);
  });

  it("rejects invalid expanded proof payloads before contract submission", async () => {
    const { recordProposalPackageSubmitted } = await importRelayer();

    await expect(
      recordProposalPackageSubmitted({
        tenderId: "tender-1",
        actorEmployeeHash,
        actorRole: "VENDOR",
        packageHash: ""
      })
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
  });

  it("fails safely outside mock mode when the relayer private key is missing", async () => {
    vi.stubEnv("BLOCKCHAIN_MODE", "local");
    vi.stubEnv("RELAYER_PRIVATE_KEY", "");
    const { recordBidSubmitted } = await importRelayer();

    await expect(
      recordBidSubmitted({
        tenderId: "tender-1",
        actorEmployeeHash,
        actorRole: "VENDOR",
        fromState: "CREATED",
        toState: "BID_SUBMITTED",
        bidHash
      })
    ).rejects.toMatchObject({
      code: "RELAYER_CONFIG_ERROR"
    });
  });

  it("preserves local mode safety checks for expanded proof methods", async () => {
    vi.stubEnv("BLOCKCHAIN_MODE", "local");
    vi.stubEnv("RELAYER_PRIVATE_KEY", "");
    const { recordTenderPublished } = await importRelayer();

    await expect(
      recordTenderPublished({
        tenderId: "tender-1",
        actorEmployeeHash,
        actorRole: "APPROVING_OFFICER",
        manifestHash: documentHash
      })
    ).rejects.toMatchObject({
      code: "RELAYER_CONFIG_ERROR"
    });
  });

  it("rejects invalid allowlisted contract addresses outside mock mode", async () => {
    vi.stubEnv("BLOCKCHAIN_MODE", "local");
    vi.stubEnv("RELAYER_PRIVATE_KEY", validPrivateKey);
    vi.stubEnv("TENDER_REGISTRY_ADDRESS", "not-an-address");
    vi.stubEnv("APPROVAL_MANAGER_ADDRESS", validAddress);
    vi.stubEnv("AUDIT_LOG_ADDRESS", validAddress);
    const { recordTenderCreated } = await importRelayer();

    await expect(
      recordTenderCreated({
        tenderId: "tender-1",
        actorEmployeeHash,
        actorRole: "PROCUREMENT_OFFICER",
        fromState: null,
        toState: "CREATED",
        documentHash
      })
    ).rejects.toMatchObject({
      code: "RELAYER_CONFIG_ERROR"
    });
  });

  it("fails safely in Sepolia mode when the relayer private key is missing", async () => {
    vi.stubEnv("BLOCKCHAIN_MODE", "sepolia");
    vi.stubEnv("SEPOLIA_RPC_URL", "https://sepolia.example.invalid");
    vi.stubEnv("RELAYER_PRIVATE_KEY", "");
    const { recordPaymentApproved } = await importRelayer();

    await expect(
      recordPaymentApproved({
        tenderId: "tender-1",
        actorEmployeeHash,
        actorRole: "FINANCE_OFFICER",
        fromState: "EVALUATION_APPROVED",
        toState: "PAYMENT_APPROVED"
      })
    ).rejects.toMatchObject({
      code: "RELAYER_CONFIG_ERROR"
    });
  });

  it("fails safely in Sepolia mode when the RPC URL is missing", async () => {
    vi.stubEnv("BLOCKCHAIN_MODE", "sepolia");
    vi.stubEnv("SEPOLIA_RPC_URL", "");
    vi.stubEnv("RELAYER_PRIVATE_KEY", validPrivateKey);
    vi.stubEnv("TENDER_REGISTRY_ADDRESS", validAddress);
    vi.stubEnv("APPROVAL_MANAGER_ADDRESS", validAddress);
    vi.stubEnv("AUDIT_LOG_ADDRESS", validAddress);
    const { recordPaymentApproved } = await importRelayer();

    await expect(
      recordPaymentApproved({
        tenderId: "tender-1",
        actorEmployeeHash,
        actorRole: "FINANCE_OFFICER",
        fromState: "EVALUATION_APPROVED",
        toState: "PAYMENT_APPROVED"
      })
    ).rejects.toMatchObject({
      code: "RELAYER_CONFIG_ERROR"
    });
  });

  it("returns mock transaction status for deterministic mock tx hashes", async () => {
    const { getTransactionStatus, recordTenderCreated } = await importRelayer();
    const transaction = await recordTenderCreated({
      tenderId: "tender-1",
      actorEmployeeHash,
      actorRole: "PROCUREMENT_OFFICER",
      fromState: null,
      toState: "CREATED",
      documentHash
    });

    await expect(getTransactionStatus(transaction.txHash)).resolves.toMatchObject({
      txHash: transaction.txHash,
      status: "MOCK_CONFIRMED",
      network: "mock"
    });
  });

  it("formats Sepolia explorer links without needing a private key", async () => {
    vi.stubEnv("BLOCKCHAIN_MODE", "sepolia");
    vi.stubEnv("ETHERSCAN_BASE_URL", "https://sepolia.etherscan.io/tx/");
    const { getExplorerUrl } = await importRelayer();

    expect(getExplorerUrl(`0x${"a".repeat(64)}`)).toBe(`https://sepolia.etherscan.io/tx/0x${"a".repeat(64)}`);
  });
});
