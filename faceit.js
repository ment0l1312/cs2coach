// Клиент FACEIT Data API v4.
// Документация: https://developers.faceit.com/docs/auth/api-keys и https://docs.faceit.com/docs/data-api/data
// ВАЖНО: названия полей ниже соответствуют публичной документации FACEIT Data API v4 на момент
// написания кода, но я не могу обратиться к интернету из этого контейнера, чтобы прогнать
// реальный запрос и свериться "вживую". Перед первым запуском воркера сверьте форму ответа
// /matches/{id}/stats с актуальной документацией — если поля переименовались, достаточно
// поправить только extractPlayerRow() ниже, остальной код не завязан на конкретные имена полей.

import dotenv from 'dotenv';
dotenv.config();

const BASE = 'https://open.faceit.com/data/v4';
const KEY = process.env.FACEIT_API_KEY;

async function faceitGet(pathAndQuery) {
  const res = await fetch(BASE + pathAndQuery, {
    headers: { Authorization: `Bearer ${KEY}` }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`FACEIT API ${res.status} on ${pathAndQuery}: ${body}`);
  }
  return res.json();
}

// Находит игрока по нику, возвращает { playerId, elo, skillLevel } или null.
export async function resolvePlayerByNickname(nickname) {
  try {
    const data = await faceitGet(`/players?nickname=${encodeURIComponent(nickname)}`);
    const cs2 = data.games?.cs2 || data.games?.csgo; // на случай старых аккаунтов без cs2
    return {
      playerId: data.player_id,
      elo: cs2?.faceit_elo ?? null,
      skillLevel: cs2?.skill_level ?? null
    };
  } catch (e) {
    return null;
  }
}

// Возвращает последние матчи игрока (новые первыми), максимум `limit`.
export async function getMatchHistory(playerId, { limit = 20, from } = {}) {
  const q = new URLSearchParams({ game: 'cs2', offset: '0', limit: String(limit) });
  if (from) q.set('from', String(from));
  const data = await faceitGet(`/players/${playerId}/history?${q.toString()}`);
  return data.items || [];
}

// Возвращает сырую статистику матча.
export async function getMatchStats(matchId) {
  return faceitGet(`/matches/${matchId}/stats`);
}

// Достаёт строку статистики конкретного игрока из ответа getMatchStats().
// Возвращает null, если игрока не нашли в этом матче (не должно случаться, но на всякий случай).
export function extractPlayerRow(matchStats, playerId) {
  for (const round of matchStats.rounds || []) {
    for (const team of round.teams || []) {
      for (const p of team.players || []) {
        if (p.player_id === playerId) {
          const s = p.player_stats || {};
          return {
            map: round.round_stats?.Map || null,
            result: s.Result === '1' || s.Result === 1 ? 'W' : 'L',
            rounds: Number(round.round_stats?.Rounds) || null,
            kills: Number(s.Kills) || 0,
            deaths: Number(s.Deaths) || 0,
            assists: Number(s.Assists) || 0
          };
        }
      }
    }
  }
  return null;
}
