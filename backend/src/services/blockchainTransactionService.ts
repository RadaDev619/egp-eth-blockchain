import { Prisma, type BlockchainTransaction } from "@prisma/client";

type BlockchainTransactionWriter = {
  blockchainTransaction: {
    create(args: { data: Prisma.BlockchainTransactionUncheckedCreateInput }): Promise<BlockchainTransaction>;
    findUnique(args: { where: { txHash: string } }): Promise<BlockchainTransaction | null>;
  };
};

export async function createBlockchainTransactionRecord(
  client: BlockchainTransactionWriter,
  data: Prisma.BlockchainTransactionUncheckedCreateInput
) {
  try {
    return await client.blockchainTransaction.create({ data });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      data.txHash &&
      typeof data.txHash === "string"
    ) {
      const existing = await client.blockchainTransaction.findUnique({
        where: { txHash: data.txHash }
      });

      if (existing) {
        return existing;
      }
    }

    throw error;
  }
}
