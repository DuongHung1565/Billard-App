import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { compare, hash } from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { z, ZodError } from 'zod';
import ExcelJS from 'exceljs';
import { auth, roles, setCookie, sign } from './auth';
import { db, transaction } from './db';
import { AppError, assert } from '../lib/errors';
import { bookingSchema, phoneSchema, registerSchema, validateBooking, validateReport, validateVoucherDates, voucherSchema } from '../lib/validation';
import { DAY, dayStart, localDay, MINUTE } from '../lib/time';
import { Rate, validateRates } from '../lib/billing';
import { currentSession, expire, maintenance, openSession, sessionBill } from './operations';
const asyncRoute = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { Promise.resolve(fn(req,res)).catch(next); };
const staff = roles('ADMIN','CASHIER');
const safeUser = { id: true, name: true, phone: true, email: true, role: true, birthDate: true } as const;
export function createApp(onChange: () => void = () => {}, now = () => new Date()) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet(), cors({ origin: process.env.WEB_ORIGIN || 'http://localhost:3000', credentials: true }), express.json({ limit: '32kb' }), cookieParser());
  app.use('/api', (req, _res, next) => {
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && (req.header('X-Cue-Client') !== 'web' || (req.headers.origin && req.headers.origin !== (process.env.WEB_ORIGIN || 'http://localhost:3000')))) return next(new AppError('INVALID_ORIGIN', 'Yêu cầu không hợp lệ.', 403));
    next();
  });
  const limiter = rateLimit({ windowMs: 15 * MINUTE, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMIT', message: 'Quá nhiều lần thử. Vui lòng thử lại sau.' } } });
  app.get('/api/health', asyncRoute(async (_req,res) => { await db.$queryRaw`SELECT 1`; res.json({ status: 'ok' }); }));
  app.post('/api/auth/register', limiter, asyncRoute(async (req,res) => {
    const data = registerSchema.parse(req.body);
    assert(!data.birthDate || data.birthDate <= localDay(now()), 'INVALID_BIRTH_DATE', 'Ngày sinh không được ở tương lai.');
    const user = await db.user.create({ data: { name: data.name, phone: data.phone, email: data.email, birthDate: data.birthDate, passwordHash: await hash(data.password, 12) }, select: safeUser });
    setCookie(res, sign(user)); res.status(201).json(user);
  }));
  app.post('/api/auth/login', limiter, asyncRoute(async (req,res) => {
    const data = z.object({ phone: phoneSchema, password: z.string().min(1).max(128) }).parse(req.body);
    const user = await db.user.findUnique({ where: { phone: data.phone } });
    assert(user && await compare(data.password, user.passwordHash), 'INVALID_CREDENTIALS', 'Số điện thoại hoặc mật khẩu không đúng.', 401);
    setCookie(res, sign(user)); const { passwordHash: _, ...safe } = user; res.json(safe);
  }));
  app.post('/api/auth/logout', (_req,res) => { res.clearCookie('cue_session', { path: '/' }); res.json({ ok: true }); });
  app.use('/api', auth);
  app.get('/api/auth/me', asyncRoute(async (req,res) => { const user = await db.user.findUnique({ where: { id: req.identity!.id }, select: safeUser }); assert(user, 'UNAUTHENTICATED', 'Tài khoản không tồn tại.', 401); res.json(user); }));
  app.get('/api/tables', asyncRoute(async (req,res) => {
    if (await maintenance(now())) onChange();
    const tables = await db.table.findMany({ orderBy: { name: 'asc' }, include: { sessions: { where: { status: { in: ['OPEN','STOPPED'] } }, include: { items: true, user: { select: { name: true, phone: true } } } }, bookings: { where: { status: 'PENDING' }, orderBy: { startsAt: 'asc' }, include: { user: { select: { name: true, phone: true } } } } } });
    const customer = req.identity!.role === 'CUSTOMER';
    res.json({ serverTime: now().toISOString(), tables: tables.map(t => ({ ...t, sessions: t.sessions.map(s => customer ? { id: s.id, status: s.status, startedAt: s.startedAt } : { ...s, bill: sessionBill(s, now()) }), bookings: t.bookings.map(b => customer && b.userId !== req.identity!.id ? { startsAt: b.startsAt, endsAt: b.endsAt, status: b.status } : b) })) });
  }));
  app.get('/api/prices', asyncRoute(async (_req,res) => { res.json(await db.priceConfig.findUniqueOrThrow({ where: { id: 1 } })); }));
  app.get('/api/products', asyncRoute(async (_req,res) => { res.json(await db.product.findMany({ where: { active: true }, orderBy: { price: 'asc' } })); }));
  app.get('/api/bookings', asyncRoute(async (req,res) => {
    if (await maintenance(now())) onChange();
    res.json(await db.booking.findMany({ where: req.identity!.role === 'CUSTOMER' ? { userId: req.identity!.id } : {}, include: { table: true, user: { select: { name: true, phone: true } } }, orderBy: { startsAt: 'desc' }, take: 200 }));
  }));
  app.post('/api/bookings', asyncRoute(async (req,res) => {
    const data = bookingSchema.parse(req.body); const startsAt = new Date(data.startsAt); const endsAt = new Date(startsAt.getTime() + data.duration * MINUTE);
    const booking = await transaction(async tx => {
      const clock = now(); validateBooking(startsAt, data.duration, clock); await expire(tx, clock);
      assert(await tx.table.findUnique({ where: { id: data.tableId } }), 'TABLE_NOT_FOUND', 'Không tìm thấy bàn.', 404);
      assert(!await tx.booking.findFirst({ where: { userId: req.identity!.id, status: 'PENDING' } }), 'PENDING_BOOKING_EXISTS', 'Mỗi tài khoản chỉ được giữ một đơn chờ nhận bàn.', 409);
      assert(!await tx.booking.findFirst({ where: { tableId: data.tableId, status: 'PENDING', startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } }), 'BOOKING_CONFLICT', 'Khung giờ này vừa được đặt. Vui lòng chọn giờ khác.', 409);
      const active = await tx.session.findFirst({ where: { tableId: data.tableId, status: { in: ['OPEN','STOPPED'] } }, include: { booking: true } });
      assert(!active || !active.booking || active.booking.endsAt <= startsAt, 'BOOKING_CONFLICT', 'Khung giờ trùng phiên chơi đã đặt trước.', 409);
      return tx.booking.create({ data: { tableId: data.tableId, userId: req.identity!.id, startsAt, endsAt } });
    }); onChange(); res.status(201).json(booking);
  }));
  app.post('/api/bookings/:id/cancel', asyncRoute(async (req,res) => {
    const booking = await transaction(async tx => {
      const b = await tx.booking.findUnique({ where: { id: req.params.id } });
      assert(b && (b.userId === req.identity!.id || req.identity!.role !== 'CUSTOMER'), 'BOOKING_NOT_FOUND', 'Không tìm thấy đơn đặt bàn.', 404);
      assert(b.status === 'PENDING', 'BOOKING_UNAVAILABLE', 'Đơn không còn ở trạng thái chờ.', 409);
      return tx.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED' } });
    }); onChange(); res.json(booking);
  }));
  app.post('/api/sessions', staff, asyncRoute(async (req,res) => {
    const data = z.object({ tableId: z.string().min(1), phone: z.preprocess(v => v === '' ? undefined : v, phoneSchema.optional()), bookingId: z.string().optional() }).parse(req.body);
    await maintenance(now());
    const session = await openSession(data.tableId, data.phone, data.bookingId, now()); onChange(); res.status(201).json(session);
  }));
  app.post('/api/sessions/:id/cancel', staff, asyncRoute(async (req,res) => {
    const result = await transaction(async tx => {
      const s = await currentSession(tx, req.params.id);
      assert(s.status === 'OPEN' && now().getTime() - s.startedAt.getTime() <= 180000, 'GRACE_EXPIRED', 'Chỉ được hủy mở nhầm trong 180 giây đầu.', 409);
      if (s.bookingId) await tx.booking.update({ where: { id: s.bookingId }, data: { status: 'CANCELLED' } });
      return tx.session.update({ where: { id: s.id }, data: { status: 'CANCELLED', stoppedAt: now() } });
    }); onChange(); res.json(result);
  }));
  app.put('/api/sessions/:id/items', staff, asyncRoute(async (req,res) => {
    const data = z.object({ productId: z.string(), quantity: z.number().int().min(0).max(99) }).parse(req.body);
    await maintenance(now());
    await transaction(async tx => {
      const s = await currentSession(tx, req.params.id); assert(s.status === 'OPEN', 'SESSION_LOCKED', 'Phiên đã chốt giờ.', 409);
      const product = await tx.product.findUnique({ where: { id: data.productId } }); assert(product?.active, 'PRODUCT_NOT_FOUND', 'Dịch vụ không khả dụng.', 404);
      if (!data.quantity) { await tx.sessionItem.deleteMany({ where: { sessionId: s.id, productId: product.id } }); return; }
      await tx.sessionItem.upsert({ where: { sessionId_productId: { sessionId: s.id, productId: product.id } }, update: { quantity: data.quantity }, create: { sessionId: s.id, productId: product.id, name: product.name, price: product.price, quantity: data.quantity } });
    }); onChange(); res.json({ ok: true });
  }));
  app.post('/api/sessions/:id/stop', staff, asyncRoute(async (req,res) => {
    await maintenance(now());
    const result = await transaction(async tx => {
      const s = await currentSession(tx, req.params.id);
      assert(['OPEN','STOPPED'].includes(s.status), 'SESSION_LOCKED', 'Phiên đã đóng.', 409);
      if (s.status === 'OPEN') await tx.session.update({ where: { id: s.id }, data: { status: 'STOPPED', stoppedAt: now() } });
      return sessionBill(await currentSession(tx, s.id), now());
    }); onChange(); res.json(result);
  }));
  async function quote(tx: Prisma.TransactionClient, id: string, code?: string) {
    const s = await currentSession(tx,id); assert(s.status === 'STOPPED', 'SESSION_NOT_STOPPED', 'Hãy chốt giờ trước khi thanh toán.', 409);
    const voucher = code ? await tx.voucher.findUnique({ where: { code } }) : null;
    if (code) assert(voucher && voucher.startsOn <= localDay(now()) && voucher.endsOn >= localDay(now()) && voucher.usedCount < voucher.usageLimit, 'VOUCHER_UNAVAILABLE', 'Voucher không tồn tại, hết hạn hoặc hết lượt.', 409);
    return { s, voucher, bill: sessionBill(s, now(), voucher ?? undefined) };
  }
  app.post('/api/sessions/:id/quote', staff, asyncRoute(async (req,res) => {
    const { code } = z.object({ code: z.string().regex(/^[A-Z0-9]{4,10}$/).optional() }).parse(req.body);
    const { bill } = await transaction(tx => quote(tx,req.params.id,code));
    const bank = process.env.VIETQR_BANK_BIN; const account = process.env.VIETQR_ACCOUNT;
    const reference = `CUE${req.params.id.slice(-10).toUpperCase()}`;
    const qrUrl = bank && account && /^\d{6}$/.test(bank) && /^\d{6,20}$/.test(account) && bill.total > 0 ? `https://img.vietqr.io/image/${bank}-${account}-compact2.png?${new URLSearchParams({ amount: String(bill.total), addInfo: reference, accountName: process.env.VIETQR_ACCOUNT_NAME || '' })}` : null;
    res.json({ ...bill, qrUrl, reference });
  }));
  app.post('/api/sessions/:id/pay', staff, asyncRoute(async (req,res) => {
    const data = z.object({ code: z.string().regex(/^[A-Z0-9]{4,10}$/).optional(), tendered: z.number().int().min(0).max(2000000000), expectedTotal: z.number().int().min(0), method: z.enum(['CASH','TRANSFER']), transferConfirmed: z.boolean().optional() }).parse(req.body);
    const result = await transaction(async tx => {
      // Session ID is the idempotency key; duplicate payments never consume another voucher.
      const existing = await tx.invoice.findUnique({ where: { sessionId: req.params.id } }); if (existing) return existing;
      const { s, voucher, bill } = await quote(tx,req.params.id,data.code);
      assert(bill.total === data.expectedTotal, 'QUOTE_CHANGED', 'Tổng tiền đã thay đổi. Vui lòng xem lại hóa đơn.', 409);
      assert(data.tendered >= bill.total, 'INSUFFICIENT_PAYMENT', 'Tiền khách đưa phải lớn hơn hoặc bằng tổng thanh toán.');
      assert(data.method !== 'TRANSFER' || data.transferConfirmed, 'TRANSFER_NOT_CONFIRMED', 'Cần xác nhận đã nhận tiền trong tài khoản.');
      if (voucher) await tx.voucher.update({ where: { id: voucher.id }, data: { usedCount: { increment: 1 } } });
      const invoice = await tx.invoice.create({ data: { sessionId: s.id, voucherId: voucher?.id, breakdown: bill, play: bill.play, services: bill.services, discount: bill.totalDiscount, total: bill.total, tendered: data.tendered, change: data.tendered-bill.total, method: data.method, cashierId: req.identity!.id } });
      await tx.session.update({ where: { id: s.id }, data: { status: 'PAID' } }); return invoice;
    }); onChange(); res.json(result);
  }));
  app.get('/api/customers', staff, asyncRoute(async (req,res) => { const search = z.string().max(50).parse(req.query.search || ''); res.json(await db.user.findMany({ where: { OR: [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }] }, select: safeUser, take: 100, orderBy: { createdAt: 'desc' } })); }));
  app.put('/api/admin/prices', roles('ADMIN'), asyncRoute(async (req,res) => {
    const rates = z.array(z.object({ startMinute: z.number(), endMinute: z.number(), hourlyRate: z.number() })).max(96).parse(req.body.rates);
    validateRates(rates); const result = await transaction(tx => tx.priceConfig.update({ where: { id: 1 }, data: { rates } })); onChange(); res.json(result);
  }));
  app.get('/api/admin/vouchers', roles('ADMIN'), asyncRoute(async (_req,res) => { res.json(await db.voucher.findMany({ orderBy: { endsOn: 'desc' } })); }));
  app.post('/api/admin/vouchers', roles('ADMIN'), asyncRoute(async (req,res) => { const data = voucherSchema.parse(req.body); validateVoucherDates(data.startsOn,data.endsOn,now()); res.status(201).json(await db.voucher.create({ data })); }));
  async function report(req: Request) {
    const { from, to } = z.object({ from: z.string(), to: z.string() }).parse(req.query); validateReport(from,to,now());
    const invoices = await db.invoice.findMany({ where: { paidAt: { gte: dayStart(from), lt: new Date(dayStart(to).getTime() + DAY) }, session: { status: 'PAID' } }, include: { session: { include: { table: true } } }, orderBy: { paidAt: 'desc' } });
    return { invoices, totals: invoices.reduce((a,i) => ({ play: a.play+i.play, services: a.services+i.services, discount: a.discount+i.discount, net: a.net+i.total }), { play: 0, services: 0, discount: 0, net: 0 }) };
  }
  app.get('/api/admin/reports', roles('ADMIN'), asyncRoute(async (req,res) => { res.json(await report(req)); }));
  app.get('/api/admin/reports/export', roles('ADMIN'), asyncRoute(async (req,res) => {
    const { invoices } = await report(req); assert(invoices.length, 'NO_TRANSACTIONS', 'Không có giao dịch để xuất.');
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Doanh thu');
    sheet.columns = [{ header: 'Hóa đơn', key: 'id', width: 30 }, { header: 'Bàn', key: 'table', width: 14 }, { header: 'Thanh toán (VN)', key: 'paidAt', width: 25 }, { header: 'Giờ chơi', key: 'play' }, { header: 'Dịch vụ', key: 'services' }, { header: 'Giảm giá', key: 'discount' }, { header: 'Thực thu', key: 'total' }];
    invoices.forEach(i => sheet.addRow({ ...i, table: i.session.table.name, paidAt: i.paidAt.toLocaleString('vi-VN',{ timeZone: 'Asia/Ho_Chi_Minh' }) })); sheet.getRow(1).font = { bold: true };
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition','attachment; filename="cue-revenue.xlsx"'); await workbook.xlsx.write(res); res.end();
  }));
  app.use((_req,_res,next) => next(new AppError('NOT_FOUND','Không tìm thấy API.',404)));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Vui lòng kiểm tra dữ liệu nhập.', fields: error.flatten() } }); return; }
    if (error instanceof AppError) { res.status(error.status).json({ error: { code: error.code, message: error.message } }); return; }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { res.status(409).json({ error: { code: 'DUPLICATE', message: 'Dữ liệu đã tồn tại hoặc vừa được sử dụng.' } }); return; }
    if (error instanceof SyntaxError) { res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Dữ liệu JSON không hợp lệ.' } }); return; }
    console.error(error); res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Không thể xử lý yêu cầu. Vui lòng thử lại.' } });
  });
  return app;
}
