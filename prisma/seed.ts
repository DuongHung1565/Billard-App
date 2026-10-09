import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
const db = new PrismaClient();
async function main() {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 8) throw new Error('Set SEED_ADMIN_PASSWORD (8+ characters).');
  await db.user.upsert({ where: { phone: '0900000000' }, update: {}, create: { name: 'Quản trị viên', phone: '0900000000', role: 'ADMIN', passwordHash: await hash(password, 12) } });
  for (let i = 1; i <= 12; i++) await db.table.upsert({ where: { name: `Bàn ${String(i).padStart(2,'0')}` }, update: {}, create: { name: `Bàn ${String(i).padStart(2,'0')}`, kind: i > 8 ? 'Carom 3 băng' : 'Pool 9 bi', zone: i > 6 ? 'Tầng 2' : 'Tầng 1' } });
  await db.priceConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1, rates: [{ startMinute: 480, endMinute: 1080, hourlyRate: 60000 }, { startMinute: 1080, endMinute: 1440, hourlyRate: 90000 }] } });
  for (const [name, price] of [['Nước suối',15000],['Coca-Cola',20000],['Bia Tiger',25000],['Cà phê đen',25000],['Mì xào bò',55000],['Khăn lạnh',5000]] as const) await db.product.upsert({ where: { name }, update: {}, create: { name, price } });
  console.log('Seed complete. Admin phone: 0900000000. Password: SEED_ADMIN_PASSWORD.');
}
main().finally(() => db.$disconnect());
