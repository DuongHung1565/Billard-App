import { calculateBill, roundedMinutes, validateRates, type BillInput } from '../../lib/billing';
const rates = [{ startMinute: 480, endMinute: 1080, hourlyRate: 60000 }, { startMinute: 1080, endMinute: 1440, hourlyRate: 90000 }];
const at = (time: string) => new Date(`2026-10-09T${time}+07:00`);
function bill(overrides: Partial<BillInput> = {}) { return calculateBill({ startedAt: at('17:45:00'), stoppedAt: at('18:15:00'), rates, services: 0, birthday: false, ...overrides }); }
describe('15 minute blocks — boundary value analysis', () => {
  test.each([[0,0],[4,0],[4.999,0],[5,0],[7,0],[7.999,0],[8,15],[14,15],[15,15],[16,15],[22.999,15],[23,30],[29,30],[30,30],[359,360],[360,360]])('%s minutes → %s', (elapsed,expected) => expect(roundedMinutes(elapsed*60000)).toBe(expected));
  test.each([-1,NaN,Infinity])('rejects invalid duration %s', ms => expect(()=>roundedMinutes(ms)).toThrow());
});
describe('Rates — equivalence partitions / full-day coverage', () => {
  test('sorts without mutating input',()=>{expect(validateRates([...rates].reverse())).toEqual(rates);});
  test.each([[],[{startMinute:481,endMinute:1440,hourlyRate:60000}],[{startMinute:480.1,endMinute:1440,hourlyRate:60000}],[{startMinute:480,endMinute:1440.1,hourlyRate:60000}],[{startMinute:480,endMinute:480,hourlyRate:60000}],[{startMinute:480,endMinute:1441,hourlyRate:60000}],[{startMinute:480,endMinute:1439,hourlyRate:60000}],[rates[0],{...rates[1],startMinute:1081}],[rates[0],{...rates[1],startMinute:1079}]].map(invalid=>({invalid})))('rejects gap/overlap/out-of-range %#', ({invalid})=>expect(()=>validateRates(invalid)).toThrow());
  test.each([19999,20000.5,501000,20500])('rejects price %s', hourlyRate=>expect(()=>validateRates([{startMinute:480,endMinute:1440,hourlyRate}])).toThrow());
  test.each([20000,21000,499000,500000])('accepts price %s', hourlyRate=>expect(validateRates([{startMinute:480,endMinute:1440,hourlyRate}])).toHaveLength(1));
});
describe('Billing and time-band splitting',()=>{
  test('crosses 18:00 once, 15 normal + 15 peak',()=>{const b=bill();expect(b.play).toBe(37500);expect(b.segments.map(s=>s.minutes)).toEqual([15,15]);expect(b.total).toBe(37500);});
  test('entirely normal',()=>expect(bill({startedAt:at('08:00:00'),stoppedAt:at('09:00:00')}).play).toBe(60000));
  test('entirely peak',()=>expect(bill({startedAt:at('18:00:00'),stoppedAt:at('19:00:00')}).play).toBe(90000));
  test('round once, never round each price segment',()=>{const b=bill({startedAt:at('17:53:00'),stoppedAt:at('18:08:00')});expect(b.minutes).toBe(15);expect(b.play).toBe(19000);});
  test('truncates tail on down-round',()=>expect(bill({startedAt:at('17:45:00'),stoppedAt:at('18:07:00')}).play).toBe(15000));
  test('adds peak tail on up-round',()=>expect(bill({startedAt:at('17:45:00'),stoppedAt:at('18:08:00')}).play).toBe(37500));
  test('free early session still charges services',()=>{const b=bill({stoppedAt:at('17:49:59'),services:20000});expect(b.play).toBe(0);expect(b.total).toBe(20000);expect(b.segments).toEqual([]);});
  test('seconds allocated across rate boundary and currency rounded once',()=>expect(bill({startedAt:at('17:59:30'),stoppedAt:at('18:14:30')}).play).toBe(22250));
  test('up-rounded midnight tail uses closing rate',()=>{const b=bill({startedAt:at('23:52:00'),stoppedAt:new Date('2026-10-10T00:00:00+07:00')});expect(b.minutes).toBe(15);expect(b.play).toBe(22500);});
  test('exact midnight end allowed',()=>expect(bill({startedAt:at('23:00:00'),stoppedAt:new Date('2026-10-10T00:00:00+07:00')}).play).toBe(90000));
  test.each([{startedAt:at('07:59:59')},{startedAt:new Date('2026-10-09T00:00:00+07:00')},{startedAt:at('23:59:00'),stoppedAt:new Date('2026-10-10T00:00:01+07:00')},{stoppedAt:at('17:44:59')},{startedAt:new Date('invalid')},{services:-1},{services:1.5},{services:Number.MAX_SAFE_INTEGER+1}])('rejects invalid input %#',v=>expect(()=>bill(v)).toThrow());
});
describe('Discount stacking, thresholds and rounding',()=>{
  // 60 minutes normal price is 60,000; services choose exact subtotal boundaries.
  const normal={startedAt:at('09:00:00'),stoppedAt:at('10:00:00')};
  test.each([[239999,0],[240000,15000],[439999,25000],[440000,50000],[440001,50000]])('services %s tier discount %s',(services,discount)=>expect(bill({...normal,services}).tierDiscount).toBe(discount));
  test('birthday on play only, tier on discounted subtotal, voucher last',()=>{const b=bill({...normal,birthday:true,services:449000,voucher:{percent:10,maxDiscount:100000,minOrder:450000}});expect(b.birthdayDiscount).toBe(9000);expect(b.subtotal).toBe(500000);expect(b.tierDiscount).toBe(50000);expect(b.voucherDiscount).toBe(45000);expect(b.total).toBe(405000);expect(b.totalDiscount).toBe(104000);});
  test('birthday can move subtotal below tier threshold',()=>expect(bill({...normal,birthday:true,services:240000}).tierDiscount).toBe(0));
  test('voucher capped',()=>expect(bill({...normal,voucher:{percent:50,maxDiscount:10000,minOrder:0}}).voucherDiscount).toBe(10000));
  test('zero bill voucher is zero',()=>expect(bill({stoppedAt:at('17:45:00'),voucher:{percent:5,maxDiscount:10000,minOrder:0}}).total).toBe(0));
  test('voucher minimum unmet',()=>expect(()=>bill({...normal,voucher:{percent:10,maxDiscount:10000,minOrder:60001}})).toThrow('tối thiểu'));
  test.each([{percent:4},{percent:51},{percent:5.5},{maxDiscount:9999},{maxDiscount:10000.5},{minOrder:-1},{minOrder:0.5}])('invalid voucher %#',v=>expect(()=>bill({voucher:{percent:10,maxDiscount:10000,minOrder:0,...v}})).toThrow());
});
