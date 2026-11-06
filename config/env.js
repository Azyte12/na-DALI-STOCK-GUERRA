import fs from 'node:fs';
const envPath = new URL('../.env', import.meta.url);
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
export const databaseConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'DALIStock',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};
