import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createApp } from './app';
import { secret, verify } from './auth';
import { db } from './db';
import { maintenance } from './operations';
secret();
let io: Server;
const notify = () => io.emit('tables:changed', { at: new Date().toISOString() });
const server = createServer(createApp(notify));
io = new Server(server, { cors: { origin: process.env.WEB_ORIGIN || 'http://localhost:3000', credentials: true } });
io.use((socket,next) => {
  const cookie = socket.handshake.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('cue_session='))?.slice('cue_session='.length);
  try { const identity = verify(cookie || ''); socket.data.identity = identity; next(); } catch { next(new Error('UNAUTHENTICATED')); }
});
io.on('connection', socket => { const timeout = setTimeout(() => socket.disconnect(true), 12 * 3600000); socket.on('disconnect', () => clearTimeout(timeout)); });
let running = false;
const timer = setInterval(async () => { if (running) return; running = true; try { if (await maintenance(new Date())) notify(); } catch (error) { console.error('Maintenance failed',error); } finally { running = false; } }, 10000);
server.listen(Number(process.env.API_PORT || 4000), '127.0.0.1', () => console.log('Cue API ready on port', process.env.API_PORT || 4000));
async function shutdown() { clearInterval(timer); io.close(); server.close(); await db.$disconnect(); }
process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
