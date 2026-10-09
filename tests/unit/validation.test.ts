import { registerSchema, bookingSchema, validateBooking, voucherSchema, validateVoucherDates, validateReport } from '../../lib/validation';
import { isBirthday, localDay, dayStart } from '../../lib/time';
const now=new Date('2026-10-09T10:00:00+07:00');
const user={name:'Nguyễn Văn An',phone:'0901234567',password:'Password!1'};
describe('Registration EP/BVA',()=>{
  test.each(['An','A'.repeat(50),'Đặng Thị Ánh'])('valid name %s',name=>expect(registerSchema.safeParse({...user,name}).success).toBe(true));
  test.each(['A','A'.repeat(51),'An1','An!','   '])('invalid name %s',name=>expect(registerSchema.safeParse({...user,name}).success).toBe(false));
  test.each(['0301234567','0501234567','0701234567','0801234567','0901234567'])('valid phone %s',phone=>expect(registerSchema.safeParse({...user,phone}).success).toBe(true));
  test.each(['090123456','09012345678','0201234567','+84901234567','09abcdefgh'])('invalid phone %s',phone=>expect(registerSchema.safeParse({...user,phone}).success).toBe(false));
  test.each(['Aa1!aaaa','Aa1!'+'a'.repeat(28)])('valid password length',password=>expect(registerSchema.safeParse({...user,password}).success).toBe(true));
  test.each(['Aa1!aaa','Aa1!'+'a'.repeat(29),'aaaaaaa!1','AAAAAAA!1','Password!','Password1'])('invalid password %s',password=>expect(registerSchema.safeParse({...user,password}).success).toBe(false));
  test('optional email',()=>expect(registerSchema.parse({...user,email:''}).email).toBeUndefined());
  test('email normalized',()=>expect(registerSchema.parse({...user,email:'Test@Example.com'}).email).toBe('test@example.com'));
  test.each(['broken','a'.repeat(95)+'@e.com'])('invalid email',email=>expect(registerSchema.safeParse({...user,email}).success).toBe(false));
  test('invalid calendar date',()=>expect(registerSchema.safeParse({...user,birthDate:'2026-02-30'}).success).toBe(false));
});
describe('Booking BVA',()=>{
  test.each([30,45,345,360])('duration %s accepted',duration=>expect(bookingSchema.safeParse({tableId:'a',startsAt:now.toISOString(),duration}).success).toBe(true));
  test.each([29,31,361,0,30.5])('duration %s rejected',duration=>expect(bookingSchema.safeParse({tableId:'a',startsAt:now.toISOString(),duration}).success).toBe(false));
  test.each(['2026-10-09T10:30:00+07:00','2026-10-16T23:30:00+07:00'])('valid start %s',date=>expect(()=>validateBooking(new Date(date),30,now)).not.toThrow());
  test.each(['2026-10-08T12:00:00+07:00','2026-10-17T08:00:00+07:00','2026-10-09T10:29:59+07:00','2026-10-10T07:45:00+07:00','2026-10-10T23:45:00+07:00','2026-10-10T10:31:00+07:00','2026-10-10T10:30:01+07:00'])('invalid start %s',date=>expect(()=>validateBooking(new Date(date),30,now)).toThrow());
  test('lead time just below 30 minutes',()=>expect(()=>validateBooking(new Date('2026-10-09T10:30:00+07:00'),30,new Date('2026-10-09T10:00:00.001+07:00'))).toThrow());
});
describe('Voucher / report date bounds',()=>{
  const voucher={code:'ABCD',percent:5,maxDiscount:10000,minOrder:0,startsOn:'2026-10-09',endsOn:'2026-10-09',usageLimit:1};
  test.each(['ABCD','A123456789'])('valid code',code=>expect(voucherSchema.safeParse({...voucher,code}).success).toBe(true));
  test.each(['ABC','A1234567890','abcd','AB_C'])('invalid code',code=>expect(voucherSchema.safeParse({...voucher,code}).success).toBe(false));
  test('same-day voucher accepted',()=>expect(()=>validateVoucherDates(voucher.startsOn,voucher.endsOn,now)).not.toThrow());
  test.each([['2026-10-08','2026-10-10'],['2026-10-10','2026-10-09']])('date ordering', (start,end)=>expect(()=>validateVoucherDates(start,end,now)).toThrow());
  test('365 days allowed',()=>expect(()=>validateReport('2025-10-09','2026-10-09',now)).not.toThrow());
  test.each([['2025-10-08','2026-10-09'],['2026-10-10','2026-10-10'],['2026-10-09','2026-10-08'],['2026-02-30','2026-10-09']])('invalid report range',(a,b)=>expect(()=>validateReport(a,b,now)).toThrow());
  test('VN midnight independent of host zone',()=>{expect(localDay(new Date('2026-10-08T17:00:00Z'))).toBe('2026-10-09');expect(dayStart('2026-10-09').toISOString()).toBe('2026-10-08T17:00:00.000Z');expect(isBirthday('2000-10-09',now)).toBe(true);expect(isBirthday(null,now)).toBe(false);expect(isBirthday('2000-10-10',now)).toBe(false);});
});
