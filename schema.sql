-- CS2 Coach — схема базы данных (PostgreSQL)

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  faceit_nickname  TEXT,
  faceit_player_id TEXT,          -- id игрока в FACEIT, полученный через API по нику
  role             TEXT CHECK (role IN ('entry','support','lurk','awp','igl')),
  goal             TEXT,          -- свободный текст цели ("поднять ELO" и т.п.)
  elo              INTEGER,       -- последнее известное ELO
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS matches (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id    TEXT,               -- id матча в FACEIT, NULL если матч добавлен вручную
  map         TEXT,
  result      TEXT CHECK (result IN ('W','L')),
  rounds      INTEGER,
  kills       INTEGER,
  deaths      INTEGER,
  assists     INTEGER,
  elo_after   INTEGER,
  played_at   TIMESTAMPTZ,
  source      TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'faceit_api'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_user ON matches(user_id, played_at DESC);

CREATE TABLE IF NOT EXISTS sync_state (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_match_id  TEXT,
  last_synced_at TIMESTAMPTZ
);
