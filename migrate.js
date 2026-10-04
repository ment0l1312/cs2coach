// Применяет schema.sql к базе данных. Запуск: npm run migrate
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');
  await pool.query(sql);
  console.log('Схема базы данных применена успешно.');
  await pool.end();
}

main().catch(e => {
  console.error('Ошибка миграции:', e);
  process.exit(1);
});
