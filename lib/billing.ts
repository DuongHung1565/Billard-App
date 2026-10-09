import { assert } from './errors';
import { dayStart, localDay, MINUTE } from './time';
export type Rate = { startMinute: number; endMinute: number; hourlyRate: number };
export type BillInput = { startedAt: Date; stoppedAt: Date; rates: Rate[]; services: number; birthday: boolean; voucher?: { percent: number; maxDiscount: number; minOrder: number } };
export function validateRates(rates: Rate[]) {
  assert(rates.length > 0, 'INVALID_RATES', 'Cần ít nhất một khung giá.');
  const sorted = [...rates].sort((a,b) => a.startMinute-b.startMinute);
  let cursor = 480;
  for (const rate of sorted) {
    assert(Number.isInteger(rate.startMinute) && Number.isInteger(rate.endMinute) && rate.startMinute === cursor && rate.endMinute > rate.startMinute && rate.endMinute <= 1440, 'INVALID_RATES', 'Khung giờ phải liên tục từ 08:00 đến 24:00, không trống hoặc chồng lấn.');
    assert(Number.isInteger(rate.hourlyRate) && rate.hourlyRate >= 20000 && rate.hourlyRate <= 500000 && rate.hourlyRate % 1000 === 0, 'INVALID_RATE', 'Đơn giá từ 20.000–500.000đ, bước 1.000đ.');
    cursor = rate.endMinute;
  }
  assert(cursor === 1440, 'INVALID_RATES', 'Khung giờ phải kết thúc lúc 24:00.');
  return sorted;
}
export function roundedMinutes(elapsedMs: number) {
  assert(Number.isFinite(elapsedMs) && elapsedMs >= 0, 'INVALID_DURATION', 'Thời gian không hợp lệ.');
  const minutes = Math.floor(elapsedMs / MINUTE);
  if (minutes < 5) return 0;
  return Math.floor(minutes / 15) * 15 + (minutes % 15 >= 8 ? 15 : 0);
}
export function calculateBill(input: BillInput) {
  const rates = validateRates(input.rates);
  const start = input.startedAt.getTime();
  const stop = input.stoppedAt.getTime();
  const minutes = roundedMinutes(stop - start);
  assert(Number.isSafeInteger(input.services) && input.services >= 0, 'INVALID_SERVICES', 'Tiền dịch vụ phải là số nguyên không âm.');
  const midnight = dayStart(localDay(input.startedAt)).getTime();
  assert(start >= midnight + 480 * MINUTE && start < midnight + 1440 * MINUTE && stop <= midnight + 1440 * MINUTE, 'OUTSIDE_HOURS', 'Phiên phải nằm trong giờ 08:00–24:00.');
  // Round the duration once; allocate the billable timeline from the original start.
  // An up-rounded tail past midnight uses the final rate (at most 7 minutes).
  const billEnd = start + minutes * MINUTE;
  const segments = rates.map((rate, index) => {
    const end = index === rates.length - 1 ? Math.max(billEnd, midnight + rate.endMinute * MINUTE) : midnight + rate.endMinute * MINUTE;
    const duration = Math.max(0, Math.min(billEnd, end) - Math.max(start, midnight + rate.startMinute * MINUTE));
    return { ...rate, minutes: duration / MINUTE, amount: duration * rate.hourlyRate / (60 * MINUTE) };
  }).filter(segment => segment.minutes > 0);
  const play = Math.round(segments.reduce((sum, segment) => sum + segment.amount, 0));
  const birthdayDiscount = input.birthday ? Math.round(play * 0.15) : 0;
  const subtotal = play - birthdayDiscount + input.services;
  const tierPercent = subtotal >= 500000 ? 10 : subtotal >= 300000 ? 5 : 0;
  const tierDiscount = Math.round(subtotal * tierPercent / 100);
  const afterTier = subtotal - tierDiscount;
  let voucherDiscount = 0;
  if (input.voucher) {
    const v = input.voucher;
    assert(Number.isInteger(v.percent) && v.percent >= 5 && v.percent <= 50 && Number.isSafeInteger(v.maxDiscount) && v.maxDiscount >= 10000 && Number.isSafeInteger(v.minOrder) && v.minOrder >= 0, 'INVALID_VOUCHER', 'Cấu hình voucher không hợp lệ.');
    assert(afterTier >= v.minOrder, 'VOUCHER_MIN_ORDER', 'Hóa đơn chưa đạt giá trị tối thiểu của voucher.');
    voucherDiscount = Math.min(Math.round(afterTier * v.percent / 100), v.maxDiscount);
  }
  return { minutes, segments, play, services: input.services, birthdayDiscount, subtotal, tierPercent, tierDiscount, voucherDiscount, totalDiscount: birthdayDiscount + tierDiscount + voucherDiscount, total: afterTier - voucherDiscount };
}
