import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from './index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  console.log('Running database migrations...');
  await migrate(db, {
    migrationsFolder: path.join(__dirname, '../../drizzle'),
  });
  console.log('Migrations complete.');
  process.exit(0);
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
