import { PrismaClient, Prisma } from '@prisma/client';
import { AppError } from '../lib/errors';
export const db = new PrismaClient();
export async function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction(async tx => {
        // A single venue-wide lock gives every mutation the same lock order.
        // Serializable retries handle snapshots acquired while waiting for this lock.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(724198)`;
        return fn(tx);
      }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 15000 });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
      if (attempt === 4) throw new AppError('TRANSACTION_BUSY', 'Dữ liệu đang được cập nhật. Vui lòng thử lại.', 409);
      await new Promise(resolve => setTimeout(resolve, 20 * 2 ** attempt + Math.random() * 30));
    }
  }
  throw new Error('Unreachable');
}
