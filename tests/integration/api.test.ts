import 'dotenv/config';
import request from 'supertest';
import { db } from '../../server/db';
import { createApp } from '../../server/app';
import { sign } from '../../server/auth';
import { maintenance } from '../../server/operations';
import { Role } from '@prisma/client';
process.env.JWT_SECRET = 'test-only-secret-at-least-32-characters-long';
const rates=[{startMinute:480,endMinute:1080,hourlyRate:60000},{startMinute:1080,endMinute:1440,hourlyRate:90000}];
let clock = new Date('2026-10-09T10:00:00+07:00');
const app=createApp(()=>{},()=>clock);
let admin:string;let customers:string[];let tableIds:string[];let productId:string;
const cookie=(id:string,role:Role='CUSTOMER')=>`cue_session=${sign({id,role})}`;
const send=(path:string,token=admin,data:object={})=>request(app).post(`/api${path}`).set('Cookie',token).set('X-Cue-Client','web').send(data);
const booking=(tableId:string,startsAt='2026-10-09T12:00:00+07:00')=>({tableId,startsAt,duration:60});
beforeAll(async()=>{
  // Refuse destructive fixtures on any non-test database.
  const url=new URL(process.env.DATABASE_URL!);
  if(!url.pathname.endsWith('_test'))throw new Error('Integration tests require a dedicated database ending in _test');
  await db.$connect();
});
beforeEach(async()=>{
  clock=new Date('2026-10-09T10:00:00+07:00');
  await db.invoice.deleteMany();await db.sessionItem.deleteMany();await db.session.deleteMany();await db.booking.deleteMany();await db.voucher.deleteMany();await db.product.deleteMany();await db.table.deleteMany();await db.user.deleteMany();await db.priceConfig.deleteMany();
  const a=await db.user.create({data:{name:'Admin',phone:'0900000000',role:'ADMIN',passwordHash:'not-used'}});admin=cookie(a.id,'ADMIN');
  customers=[];for(let i=1;i<=3;i++){const u=await db.user.create({data:{name:`Customer ${i}`,phone:`090000000${i}`,passwordHash:'not-used'}});customers.push(cookie(u.id));}
  tableIds=[];for(let i=0;i<3;i++)tableIds.push((await db.table.create({data:{name:`Bàn ${i+1}`}})).id);
  productId=(await db.product.create({data:{name:'Water',price:15000}})).id;
  await db.priceConfig.create({data:{id:1,rates}});
});
afterAll(()=>db.$disconnect());
describe('Authentication and permissions',()=>{
  test('unauthenticated and customer cannot operate tables',async()=>{expect((await request(app).get('/api/tables')).status).toBe(401);expect((await send('/sessions',customers[0],{tableId:tableIds[0]})).status).toBe(403);expect((await request(app).get('/api/admin/reports').set('Cookie',customers[0])).status).toBe(403);});
  test('registration, normalization, login, duplicate account',async()=>{const input={name:'Nguyễn An',phone:'0912345678',email:'AN@Example.com',password:'Password!1'};const r=await send('/auth/register',admin,input);expect(r.status).toBe(201);expect(r.body.email).toBe('an@example.com');expect(r.body.passwordHash).toBeUndefined();expect((await send('/auth/register',admin,input)).status).toBe(409);expect((await send('/auth/login',admin,{phone:input.phone,password:input.password})).status).toBe(200);expect((await send('/auth/login',admin,{phone:input.phone,password:'bad'})).status).toBe(401);});
  test('CSRF guard rejects cross-origin mutations',async()=>{expect((await request(app).post('/api/auth/logout').send({})).status).toBe(403);expect((await request(app).post('/api/auth/logout').set('X-Cue-Client','web').set('Origin','https://evil.example').send({})).status).toBe(403);});
  test('customers cannot see other customer identities in table map',async()=>{await send('/bookings',customers[0],booking(tableIds[0]));const r=await request(app).get('/api/tables').set('Cookie',customers[1]);expect(r.status).toBe(200);expect(r.body.tables[0].bookings[0].user).toBeUndefined();expect(r.body.tables[0].bookings[0].userId).toBeUndefined();});
});
describe('Booking isolation and lifecycle',()=>{
  test('two customers racing for one slot: exactly one wins',async()=>{const results=await Promise.all(customers.slice(0,2).map(c=>send('/bookings',c,booking(tableIds[0]))));expect(results.map(r=>r.status).sort()).toEqual([201,409]);expect(await db.booking.count({where:{status:'PENDING'}})).toBe(1);});
  test('same customer races for two tables: one pending max',async()=>{const results=await Promise.all(tableIds.slice(0,2).map(t=>send('/bookings',customers[0],booking(t))));expect(results.map(r=>r.status).sort()).toEqual([201,409]);});
  test('adjacent intervals accepted, overlapping intervals rejected',async()=>{expect((await send('/bookings',customers[0],booking(tableIds[0]))).status).toBe(201);expect((await send('/bookings',customers[1],booking(tableIds[0],'2026-10-09T13:00:00+07:00'))).status).toBe(201);expect((await send('/bookings',customers[2],booking(tableIds[0],'2026-10-09T12:45:00+07:00'))).status).toBe(409);});
  test.each([-900001,-900000,900000,900001])('check-in offset %s ms',async offset=>{const b=await send('/bookings',customers[0],booking(tableIds[0]));clock=new Date(new Date(b.body.startsAt).getTime()+offset);const r=await send('/sessions',admin,{tableId:tableIds[0],bookingId:b.body.id});expect(r.status).toBe(Math.abs(offset)<=900000?201:offset>900000?409:400);});
  test('expiration is strictly after +15 minutes; account can book again',async()=>{const b=await send('/bookings',customers[0],booking(tableIds[0]));clock=new Date('2026-10-09T12:15:00+07:00');await maintenance(clock);expect((await db.booking.findUniqueOrThrow({where:{id:b.body.id}})).status).toBe('PENDING');clock=new Date(clock.getTime()+1);await maintenance(clock);expect((await db.booking.findUniqueOrThrow({where:{id:b.body.id}})).status).toBe('EXPIRED');expect((await send('/bookings',customers[0],booking(tableIds[1],'2026-10-09T14:00:00+07:00'))).status).toBe(201);});
  test('customer cannot cancel another account booking',async()=>{const b=await send('/bookings',customers[0],booking(tableIds[0]));expect((await send(`/bookings/${b.body.id}/cancel`,customers[1])).status).toBe(404);expect((await send(`/bookings/${b.body.id}/cancel`,customers[0])).status).toBe(200);});
});
describe('Operations and checkout',()=>{
  test('concurrent opening cannot create two active sessions',async()=>{const results=await Promise.all([send('/sessions',admin,{tableId:tableIds[0]}),send('/sessions',admin,{tableId:tableIds[0]})]);expect(results.map(r=>r.status).sort()).toEqual([201,409]);});
  test.each([179999,180000,180001])('grace boundary %s ms',async elapsed=>{const s=await send('/sessions',admin,{tableId:tableIds[0]});clock=new Date(clock.getTime()+elapsed);expect((await send(`/sessions/${s.body.id}/cancel`)).status).toBe(elapsed<=180000?200:409);});
  test('price snapshot, services, stop freeze, insufficient funds and idempotency',async()=>{
    const s=await send('/sessions',admin,{tableId:tableIds[0]});const id=s.body.id;
    await db.priceConfig.update({where:{id:1},data:{rates:rates.map(r=>({...r,hourlyRate:500000}))}});
    const item=await request(app).put(`/api/sessions/${id}/items`).set('Cookie',admin).set('X-Cue-Client','web').send({productId,quantity:2});expect(item.status).toBe(200);
    clock=new Date('2026-10-09T11:00:00+07:00');expect((await send(`/sessions/${id}/stop`)).body.total).toBe(90000);
    clock=new Date('2026-10-09T12:00:00+07:00');const q=await send(`/sessions/${id}/quote`);expect(q.body.total).toBe(90000);
    expect((await send(`/sessions/${id}/pay`,admin,{tendered:89999,expectedTotal:90000,method:'CASH'})).body.error.code).toBe('INSUFFICIENT_PAYMENT');
    const results=await Promise.all([1,2].map(()=>send(`/sessions/${id}/pay`,admin,{tendered:100000,expectedTotal:90000,method:'CASH'})));expect(results.map(r=>r.status)).toEqual([200,200]);expect(results[0].body.id).toBe(results[1].body.id);expect(results[0].body.change).toBe(10000);expect(await db.invoice.count()).toBe(1);
    expect((await send('/sessions',admin,{tableId:tableIds[0]})).status).toBe(201);
  });
  test('last voucher redemption is atomic across two invoices',async()=>{
    await db.voucher.create({data:{code:'LAST',percent:10,maxDiscount:50000,minOrder:0,startsOn:'2026-10-09',endsOn:'2026-10-09',usageLimit:1}});
    const sessions=await Promise.all(tableIds.slice(0,2).map(tableId=>send('/sessions',admin,{tableId})));clock=new Date('2026-10-09T11:00:00+07:00');for(const s of sessions)await send(`/sessions/${s.body.id}/stop`);
    const results=await Promise.all(sessions.map(s=>send(`/sessions/${s.body.id}/pay`,admin,{code:'LAST',tendered:60000,expectedTotal:54000,method:'CASH'})));expect(results.map(r=>r.status).sort()).toEqual([200,409]);expect((await db.voucher.findUniqueOrThrow({where:{code:'LAST'}})).usedCount).toBe(1);expect(await db.invoice.count()).toBe(1);
  });
  test('unconfirmed transfer does not pay invoice',async()=>{const s=await send('/sessions',admin,{tableId:tableIds[0]});await send(`/sessions/${s.body.id}/stop`);const r=await send(`/sessions/${s.body.id}/pay`,admin,{tendered:0,expectedTotal:0,method:'TRANSFER'});expect(r.body.error.code).toBe('TRANSFER_NOT_CONFIRMED');expect(await db.invoice.count()).toBe(0);});
  test('VietQR amount is server calculated',async()=>{process.env.VIETQR_BANK_BIN='970436';process.env.VIETQR_ACCOUNT='123456789';const s=await send('/sessions',admin,{tableId:tableIds[0]});clock=new Date('2026-10-09T11:00:00+07:00');await send(`/sessions/${s.body.id}/stop`);const r=await send(`/sessions/${s.body.id}/quote`);expect(new URL(r.body.qrUrl).searchParams.get('amount')).toBe('60000');delete process.env.VIETQR_BANK_BIN;delete process.env.VIETQR_ACCOUNT;});
  test('closing maintenance stops at midnight exactly',async()=>{clock=new Date('2026-10-09T23:00:00+07:00');const s=await send('/sessions',admin,{tableId:tableIds[0]});clock=new Date('2026-10-10T08:00:00+07:00');await maintenance(clock);const session=await db.session.findUniqueOrThrow({where:{id:s.body.id}});expect(session.stoppedAt?.toISOString()).toBe('2026-10-09T17:00:00.000Z');expect(session.status).toBe('STOPPED');});
});
describe('Reporting',()=>{
  test('empty export rejected, unpaid sessions excluded',async()=>{await send('/sessions',admin,{tableId:tableIds[0]});const r=await request(app).get('/api/admin/reports?from=2026-10-09&to=2026-10-09').set('Cookie',admin);expect(r.body.invoices).toEqual([]);expect(r.body.totals.net).toBe(0);expect((await request(app).get('/api/admin/reports/export?from=2026-10-09&to=2026-10-09').set('Cookie',admin)).status).toBe(400);});
  test('paid invoice totals and actual XLSX export',async()=>{const s=await send('/sessions',admin,{tableId:tableIds[0]});clock=new Date('2026-10-09T11:00:00+07:00');await send(`/sessions/${s.body.id}/stop`);await send(`/sessions/${s.body.id}/pay`,admin,{tendered:60000,expectedTotal:60000,method:'CASH'});await db.invoice.updateMany({data:{paidAt:clock}});const r=await request(app).get('/api/admin/reports?from=2026-10-09&to=2026-10-09').set('Cookie',admin);expect(r.body.totals.net).toBe(60000);const x=await request(app).get('/api/admin/reports/export?from=2026-10-09&to=2026-10-09').set('Cookie',admin);expect(x.status).toBe(200);expect(x.headers['content-type']).toContain('spreadsheetml');});
});
