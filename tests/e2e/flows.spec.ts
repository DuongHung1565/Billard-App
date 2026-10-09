import 'dotenv/config';
import { test, expect, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
const db=new PrismaClient();
let testTableId:string;
let testPhone:string;
async function login(page:Page){await page.goto('/');await page.getByLabel('Số điện thoại',{exact:true}).fill('0900000000');await page.getByLabel('Mật khẩu',{exact:true}).fill(process.env.SEED_ADMIN_PASSWORD!);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page.getByRole('heading',{name:'Sơ đồ bàn'})).toBeVisible();}
test.beforeAll(async()=>{testTableId=(await db.table.create({data:{name:`QA ${Date.now()}`,zone:'Kiểm thử'}})).id;testPhone='09'+String(Date.now()).slice(-8);});
test.afterAll(async()=>{const sessions=await db.session.findMany({where:{tableId:testTableId},select:{id:true}});const ids=sessions.map(s=>s.id);await db.invoice.deleteMany({where:{sessionId:{in:ids}}});await db.sessionItem.deleteMany({where:{sessionId:{in:ids}}});await db.session.deleteMany({where:{id:{in:ids}}});await db.booking.deleteMany({where:{tableId:testTableId}});await db.table.delete({where:{id:testTableId}});await db.user.deleteMany({where:{phone:testPhone}});await db.$disconnect();});
test('desktop: open, add service, stop, pay and synchronize second tab',async({page,context})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await login(page);
  const other=await context.newPage();await other.goto('/');await expect(other.getByRole('heading',{name:'Sơ đồ bàn'})).toBeVisible();
  const name=(await db.table.findUniqueOrThrow({where:{id:testTableId}})).name;
  await page.getByRole('button',{name:new RegExp(name)}).click();await page.getByRole('button',{name:'Mở bàn',exact:true}).click();
  await expect(other.getByRole('button',{name:new RegExp(name)})).toContainText('Đang chơi');
  await page.getByRole('button',{name:'Thêm Nước suối',exact:true}).click();await expect(page.locator('.bill-total')).toContainText('15.000');
  await page.getByRole('button',{name:'Chốt giờ & thanh toán'}).click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Tiền khách đưa (VNĐ)').fill('20000');await page.getByRole('button',{name:'Xác nhận thanh toán'}).click();
  await expect(page.getByRole('heading',{name:'Thanh toán thành công'})).toBeVisible();await expect(page.getByRole('dialog')).toContainText('5.000');await page.getByRole('button',{name:'Hoàn tất'}).click();
  await expect(other.getByRole('button',{name:new RegExp(name)})).toContainText('Bàn trống');expect(errors).toEqual([]);await other.close();
});
test('customer: registration, booking tomorrow, cancellation',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Đăng ký ngay'}).click();await page.getByLabel('Họ và tên').fill('Khách Kiểm Thử');await page.getByLabel('Số điện thoại',{exact:true}).fill(testPhone);await page.getByLabel('Mật khẩu',{exact:true}).fill('Password!1');await page.getByRole('button',{name:'Tạo tài khoản',exact:true}).click();await expect(page.getByRole('heading',{name:'Sơ đồ bàn'})).toBeVisible();
  await page.getByRole('button',{name:'Đặt bàn mới',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByLabel('Bàn chơi').selectOption(testTableId);const tomorrow=new Date(Date.now()+86400000+7*3600000).toISOString().slice(0,10);await modal.getByLabel('Ngày đặt').fill(tomorrow);await modal.getByLabel('Giờ bắt đầu').fill('12:00');await modal.getByRole('button',{name:'Xác nhận đặt bàn'}).click();await expect(modal).not.toBeVisible();
  await page.locator('nav').getByRole('button',{name:'Đặt bàn'}).click();await expect(page.locator('tbody')).toContainText('Chờ nhận bàn');await page.getByRole('button',{name:'Hủy lịch',exact:true}).click();await expect(page.locator('tbody')).toContainText('Đã hủy');
});
test('desktop: reports, settings, customers and responsive layout',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await login(page);await expect(page.locator('.table-card').last()).toHaveCSS('opacity','1');await page.screenshot({path:'test-results/desktop.png',fullPage:true});
  for(const name of ['Khách hàng','Doanh thu','Thiết lập']){await page.locator('nav').getByRole('button',{name,exact:true}).click();await expect(page.locator('h1')).toContainText(name);}
  await page.locator('nav').getByRole('button',{name:'Sơ đồ bàn',exact:true}).click();await page.setViewportSize({width:390,height:844});await expect(page.locator('.table-card').last()).toHaveCSS('opacity','1');await page.screenshot({path:'test-results/mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
