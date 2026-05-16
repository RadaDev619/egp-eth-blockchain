import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createBlockchainTransactionRecord } from "../../src/services/blockchainTransactionService.js";

describe("blockchainTransactionService", () => {
  it("reuses an existing blockchain transaction when a deterministic mock tx hash is already stored", async () => {
    const existingTransaction = {
      id: "blockchain-1",
      txHash: "0xmockduplicate",
      network: "mock",
      action: "EVALUATION_REPORT_COMMITTED",
      status: "MOCK_CONFIRMED"
    };
    const duplicateError = new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`txHash`)", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["txHash"] }
    });
    const client = {
      blockchainTransaction: {
        create: vi.fn(async () => {
          throw duplicateError;
        }),
        findUnique: vi.fn(async () => existingTransaction)
      }
    };

    await expect(
      createBlockchainTransactionRecord(client as never, {
        txHash: "0xmockduplicate",
        network: "mock",
        action: "EVALUATION_REPORT_COMMITTED",
        status: "MOCK_CONFIRMED"
      })
    ).resolves.toBe(existingTransaction);

    expect(client.blockchainTransaction.findUnique).toHaveBeenCalledWith({
      where: { txHash: "0xmockduplicate" }
    });
  });
});
