import { z } from 'zod';
import { assert } from './errors';
import { DAY, dayStart, localDay, MINUTE, localMinute } from './time';
export const phoneSchema = z.string().regex(/^(03|05|07|08|09)\d{8}$/, 'Số điện thoại VN phải có đúng 10 chữ số.');
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v, 'Ngày không hợp lệ.');
export const registerSchema = z.object({
  name: z.preprocess(v => typeof v === 'string' ? v.normalize('NFC') : v, z.string().trim().min(2).max(50).regex(/^[\p{L} ]+$/u, 'Họ tên chỉ chứa chữ cái và khoảng trắng.')),
  phone: phoneSchema,
  email: z.preprocess(v => v === '' ? undefined : v, z.string().trim().toLowerCase().max(100).email().optional()),
  password: z.string().min(8).max(32).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/).regex(/[!@#$%^&*]/),
  birthDate: dateSchema.optional()
});
export const bookingSchema = z.object({ tableId: z.string().min(1), startsAt: z.string().datetime({ offset: true }), duration: z.number().int().min(30).max(360).multipleOf(15) });
export function validateBooking(startsAt: Date, duration: number, now: Date) {
  const delta = dayStart(localDay(startsAt)).getTime() - dayStart(localDay(now)).getTime();
  assert(delta >= 0 && delta <= 7 * DAY, 'BOOKING_DATE', 'Chỉ được đặt từ hôm nay đến 7 ngày tiếp theo.');
  assert(startsAt.getTime() - now.getTime() >= 30 * MINUTE, 'BOOKING_LEAD_TIME', 'Vui lòng đặt trước ít nhất 30 phút.');
  const minute = localMinute(startsAt);
  assert(minute >= 480 && minute + duration <= 1440 && startsAt.getUTCSeconds() === 0 && startsAt.getUTCMilliseconds() === 0 && minute % 15 === 0, 'BOOKING_HOURS', 'Đặt trong 08:00–24:00, theo bước 15 phút.');
}
export const voucherSchema = z.object({ code: z.string().regex(/^[A-Z0-9]{4,10}$/), percent: z.number().int().min(5).max(50), maxDiscount: z.number().int().min(10000).max(100000000), minOrder: z.number().int().min(0).max(100000000), startsOn: dateSchema, endsOn: dateSchema, usageLimit: z.number().int().min(1).max(1000000) });
export function validateVoucherDates(start: string, end: string, now: Date) { assert(start >= localDay(now) && end >= start, 'VOUCHER_DATES', 'Ngày kết thúc ≥ ngày bắt đầu ≥ hôm nay.'); }
export function validateReport(from: string, to: string, now: Date) {
  dateSchema.parse(from); dateSchema.parse(to);
  assert(from <= to && to <= localDay(now) && (dayStart(to).getTime() - dayStart(from).getTime()) <= 365 * DAY, 'REPORT_RANGE', 'Từ ngày ≤ đến ngày ≤ hôm nay; tối đa 365 ngày.');
}
