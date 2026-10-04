import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

import { q } from './db.js';
import { hashPassword, checkPassword, issueToken, authMiddleware } from './auth.js';
import { resolvePlayerByNickname } from './faceit.js';
import { syncUser } from './sync.js';
import { getAdvice } from './advice.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', '..', 'client')));

// ---------- Регистрация / вход ----------

app.post('/api/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: 'invalid_input', message: 'Email и пароль (от 6 символов) обязательны.' });
  }
  const existing = await q('SELECT id FROM users WHERE email=$1', [email]);
  if (existing.rows.length) {
    return res.status(409).json({ error: 'email_taken', message: 'Этот email уже зарегистрирован.' });
  }
  const hash = await hashPassword(password);
  const r = await q('INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id', [email, hash]);
  const userId = r.rows[0].id;
  await q('INSERT INTO profiles(user_id) VALUES($1)', [userId]);
  res.json({ token: issueToken(userId) });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  const r = await q('SELECT id,password_hash FROM users WHERE email=$1', [email]);
  if (!r.rows.length) return res.status(401).json({ error: 'bad_credentials' });
  const ok = await checkPassword(password || '', r.rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'bad_credentials' });
  res.json({ token: issueToken(r.rows[0].id) });
});

// ---------- Онбординг (минимальный опрос: профиль FACEIT, роль, цель) ----------

app.post('/api/onboarding', authMiddleware, async (req, res) => {
  const { faceitNickname, role, goal } = req.body || {};
  if (!faceitNickname || !role) {
    return res.status(400).json({ error: 'invalid_input', message: 'Укажите ник FACEIT и роль.' });
  }
  const player = await resolvePlayerByNickname(faceitNickname);
  if (!player || !player.playerId) {
    return res.status(404).json({ error: 'faceit_not_found', message: 'Не нашёл такой ник на FACEIT. Проверьте написание.' });
  }
  await q(
    `UPDATE profiles SET faceit_nickname=$1, faceit_player_id=$2, role=$3, goal=$4, elo=$5, updated_at=now() WHERE user_id=$6`,
    [faceitNickname, player.playerId, role, goal || null, player.elo, req.userId]
  );
  // Первая синхронизация сразу, не дожидаясь фонового воркера
  syncUser(req.userId).catch(e => console.error('initial sync failed', e));
  res.json({ ok: true, elo: player.elo, skillLevel: player.skillLevel });
});

// ---------- Профиль и статистика ----------

app.get('/api/profile', authMiddleware, async (req, res) => {
  const r = await q('SELECT faceit_nickname, faceit_player_id, role, goal, elo FROM profiles WHERE user_id=$1', [req.userId]);
  res.json(r.rows[0] || {});
});

app.get('/api/matches', authMiddleware, async (req, res) => {
  const r = await q(
    'SELECT map, result, rounds, kills, deaths, assists, elo_after, played_at, source FROM matches WHERE user_id=$1 ORDER BY played_at ASC NULLS LAST, id ASC',
    [req.userId]
  );
  res.json(r.rows);
});

// Матч, добавленный вручную (запасной вариант, если ник FACEIT не привязан)
app.post('/api/matches', authMiddleware, async (req, res) => {
  const { map, result, rounds, kills, deaths, assists } = req.body || {};
  await q(
    `INSERT INTO matches(user_id, map, result, rounds, kills, deaths, assists, played_at, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now(), 'manual')`,
    [req.userId, map, result, rounds, kills, deaths, assists]
  );
  res.json({ ok: true });
});

// Запросить досрочную синхронизацию с FACEIT, не дожидаясь фонового воркера
app.post('/api/sync', authMiddleware, async (req, res) => {
  try {
    const added = await syncUser(req.userId);
    res.json({ ok: true, added });
  } catch (e) {
    res.status(500).json({ error: 'sync_failed', message: String(e.message || e) });
  }
});

// ИИ-совет тренера. playerStats считает клиент из уже загруженных матчей и присылает готовым.
app.post('/api/advice', authMiddleware, async (req, res) => {
  const { playerStats, question } = req.body || {};
  if (!playerStats) return res.status(400).json({ error: 'invalid_input' });
  try {
    const text = await getAdvice(playerStats, question);
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: 'advice_failed', message: String(e.message || e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CS2 Coach API слушает на порту ${PORT}`));
