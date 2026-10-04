// Фоновый процесс. Запускать отдельно от веб-сервера:
//   npm run worker
// На Railway/Render это обычно отдельный "Worker"-сервис из того же репозитория.
import dotenv from 'dotenv';
dotenv.config();
import { q } from './db.js';
import { syncUser } from './sync.js';

const INTERVAL = Number(process.env.SYNC_INTERVAL_MS || 300000); // 5 минут по умолчанию

async function tick() {
  const r = await q('SELECT user_id FROM profiles WHERE faceit_player_id IS NOT NULL');
  for (const row of r.rows) {
    try {
      const added = await syncUser(row.user_id);
      if (added) console.log(`user ${row.user_id}: +${added} матчей`);
    } catch (e) {
      console.error(`user ${row.user_id}: ошибка синхронизации`, e.message);
    }
  }
}

console.log(`Воркер запущен, интервал синхронизации: ${INTERVAL / 1000} сек.`);
tick();
setInterval(tick, INTERVAL);
