import { Prisma } from '@prisma/client';
import { assert } from '../lib/errors';
import { calculateBill, Rate } from '../lib/billing';
import { DAY, dayStart, isBirthday, localDay, localMinute, MINUTE } from '../lib/time';
import { transaction } from './db';
export async function expire(tx: Prisma.TransactionClient, now: Date) {
  return tx.booking.updateMany({ where: { status: 'PENDING', startsAt: { lt: new Date(now.getTime() - 15 * MINUTE) } }, data: { status: 'EXPIRED' } });
}
export async function currentSession(tx: Prisma.TransactionClient, id: string) {
  const session = await tx.session.findUnique({ where: { id }, include: { items: true, table: true, user: { select: { name: true, phone: true } } } });
  assert(session, 'SESSION_NOT_FOUND', 'Không tìm thấy phiên chơi.', 404);
  return session;
}
export function sessionBill(session: { startedAt: Date; stoppedAt: Date | null; rates: Prisma.JsonValue; birthday: boolean; items: { price: number; quantity: number }[] }, now: Date, voucher?: { percent: number; maxDiscount: number; minOrder: number }) {
  const close = new Date(dayStart(localDay(session.startedAt)).getTime() + DAY);
  const stoppedAt = session.stoppedAt ?? new Date(Math.min(now.getTime(), close.getTime()));
  return calculateBill({ startedAt: session.startedAt, stoppedAt, rates: session.rates as Rate[], birthday: session.birthday, services: session.items.reduce((sum, item) => sum + item.price * item.quantity, 0), voucher });
}
export async function openSession(tableId: string, phone: string | undefined, bookingId: string | undefined, now: Date) {
  return transaction(async tx => {
    await expire(tx, now);
    assert(localMinute(now) >= 480, 'OUTSIDE_HOURS', 'Chỉ mở bàn trong 08:00–24:00.');
    const table = await tx.table.findUnique({ where: { id: tableId } });
    assert(table, 'TABLE_NOT_FOUND', 'Không tìm thấy bàn.', 404);
    assert(!await tx.session.findFirst({ where: { tableId, status: { in: ['OPEN','STOPPED'] } } }), 'TABLE_BUSY', 'Bàn đang được sử dụng.', 409);
    let userId: string | undefined;
    if (bookingId) {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      assert(booking && booking.tableId === tableId && booking.status === 'PENDING', 'BOOKING_UNAVAILABLE', 'Đơn đặt bàn không còn khả dụng.', 409);
      assert(Math.abs(now.getTime() - booking.startsAt.getTime()) <= 15 * MINUTE, 'CHECKIN_WINDOW', 'Chỉ nhận bàn trong khoảng ±15 phút so với giờ hẹn.');
      userId = booking.userId;
      await tx.booking.update({ where: { id: bookingId }, data: { status: 'CHECKED_IN' } });
    } else {
      const conflict = await tx.booking.findFirst({ where: { tableId, status: 'PENDING', startsAt: { lt: new Date(now.getTime() + 15 * MINUTE) }, endsAt: { gt: now } } });
      assert(!conflict, 'TABLE_RESERVED', 'Bàn đang được giữ cho khách đặt trước.', 409);
      if (phone) {
        const user = await tx.user.findUnique({ where: { phone } });
        assert(user, 'CUSTOMER_NOT_FOUND', 'Số điện thoại chưa đăng ký.', 404); userId = user.id;
      }
    }
    const user = userId ? await tx.user.findUnique({ where: { id: userId } }) : null;
    const config = await tx.priceConfig.findUniqueOrThrow({ where: { id: 1 } });
    return tx.session.create({ data: { tableId, userId, bookingId, startedAt: now, birthday: isBirthday(user?.birthDate ?? null, now), rates: config.rates as Prisma.InputJsonValue } });
  });
}
export async function maintenance(now: Date) {
  return transaction(async tx => {
    const expired = await expire(tx, now);
    // No overnight tariff: freeze at closing, even after a restart the next day.
    const sessions = await tx.session.findMany({ where: { status: 'OPEN' } });
    let stopped = 0;
    for (const s of sessions) {
      const close = dayStart(localDay(s.startedAt)).getTime() + DAY;
      const deadline = close;
      if (now.getTime() >= deadline) { await tx.session.update({ where: { id: s.id }, data: { status: 'STOPPED', stoppedAt: new Date(Math.max(s.startedAt.getTime(), deadline)) } }); stopped++; }
    }
    return expired.count + stopped;
  });
}
