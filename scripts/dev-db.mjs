import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import path from 'node:path';
const databaseDir = path.resolve('.data/postgres');
const pg = new EmbeddedPostgres({ databaseDir, user: 'cue', password: 'cue_local_password', port: 5432, persistent: true, authMethod: 'scram-sha-256', initdbFlags: ['--encoding=UTF8','--locale=C'], postgresFlags: ['-h','127.0.0.1'], onLog: () => {}, onError: message => { if (/FATAL|ERROR/.test(String(message))) console.error(String(message)); } });
if (!existsSync(path.join(databaseDir,'PG_VERSION'))) await pg.initialise();
await pg.start();
const client = pg.getPgClient(); await client.connect();
for (const name of ['cueclub','cueclub_test']) { const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1',[name]); if (!result.rowCount) await client.query(`CREATE DATABASE "${name}" ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`); }
await client.end();
console.log('Local PostgreSQL ready on 127.0.0.1:5432. Databases: cueclub, cueclub_test.');
async function stop(){await pg.stop();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
setInterval(()=>{},60000);
