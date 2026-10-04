import { q } from './db.js';
import { getMatchHistory, getMatchStats, extractPlayerRow } from './faceit.js';

// Подтягивает новые матчи одного пользователя с FACEIT и сохраняет их в БД.
// Возвращает число добавленных матчей. Идемпотентна: уже сохранённые матчи не дублирует
// (ограничение UNIQUE(user_id, match_id) в схеме плюс проверка по sync_state).
export async function syncUser(userId) {
  const pr = await q('SELECT faceit_player_id FROM profiles WHERE user_id=$1', [userId]);
  const playerId = pr.rows[0]?.faceit_player_id;
  if (!playerId) return 0;

  const history = await getMatchHistory(playerId, { limit: 20 });
  let added = 0;

  for (const item of history) {
    const matchId = item.match_id;
    const exists = await q('SELECT 1 FROM matches WHERE user_id=$1 AND match_id=$2', [userId, matchId]);
    if (exists.rows.length) continue; // уже сохранён

    let stats;
    try {
      stats = await getMatchStats(matchId);
    } catch (e) {
      console.error('getMatchStats failed for', matchId, e.message);
      continue;
    }
    const row = extractPlayerRow(stats, playerId);
    if (!row) continue;

    await q(
      `INSERT INTO matches(user_id, match_id, map, result, rounds, kills, deaths, assists, played_at, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, to_timestamp($9), 'faceit_api')
       ON CONFLICT (user_id, match_id) DO NOTHING`,
      [userId, matchId, row.map, row.result, row.rounds, row.kills, row.deaths, row.assists,
       (item.finished_at || item.started_at || Date.now() / 1000)]
    );
    added++;
  }

  await q(
    `INSERT INTO sync_state(user_id, last_match_id, last_synced_at) VALUES ($1,$2, now())
     ON CONFLICT (user_id) DO UPDATE SET last_match_id=$2, last_synced_at=now()`,
    [userId, history[0]?.match_id || null]
  );

  return added;
}
