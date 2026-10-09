import { Prisma } from '@prisma/client';
import { db, transaction } from '../../server/db';
const conflict=()=>new Prisma.PrismaClientKnownRequestError('write conflict or deadlock',{code:'P2034',clientVersion:'6'});
afterEach(()=>jest.restoreAllMocks());
afterAll(()=>db.$disconnect());
test('retries serialization failure/deadlock, then returns committed result',async()=>{
  const spy=jest.spyOn(db,'$transaction').mockRejectedValueOnce(conflict()).mockResolvedValueOnce('committed');
  await expect(transaction(async()=> 'unused')).resolves.toBe('committed');expect(spy).toHaveBeenCalledTimes(2);
});
test('bounded retries return a clear conflict instead of hanging',async()=>{
  const spy=jest.spyOn(db,'$transaction').mockRejectedValue(conflict());
  await expect(transaction(async()=> 'unused')).rejects.toMatchObject({code:'TRANSACTION_BUSY',status:409});expect(spy).toHaveBeenCalledTimes(5);
});
test('unrelated errors are not retried',async()=>{
  const spy=jest.spyOn(db,'$transaction').mockRejectedValue(new Error('unrelated'));
  await expect(transaction(async()=> 'unused')).rejects.toThrow('unrelated');expect(spy).toHaveBeenCalledTimes(1);
});
