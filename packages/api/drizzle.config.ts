import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    schema: './src/db/schema-flat.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL ?? 'postgresql://leadflow:leadflow@localhost:5432/leadflow',
    },
    verbose: true,
    strict: true,
});
