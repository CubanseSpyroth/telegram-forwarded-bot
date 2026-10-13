const db = require('./connection');

function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY,
      username      TEXT,
      first_name    TEXT,
      plan          TEXT NOT NULL DEFAULT 'free',
      plan_expires  DATETIME,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS channels (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      chat_id       TEXT NOT NULL,
      title         TEXT,
      type          TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, chat_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL,
      content         TEXT NOT NULL,
      schedule_type   TEXT NOT NULL,
      hour            INTEGER NOT NULL,
      minute          INTEGER NOT NULL,
      weekday         INTEGER,
      day_of_month    INTEGER,
      run_date        DATETIME,
      next_run        DATETIME,
      last_run        DATETIME,
      is_active       INTEGER DEFAULT 1,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS schedule_targets (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id   INTEGER NOT NULL,
      chat_id       TEXT NOT NULL,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS delivery_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id   INTEGER NOT NULL,
      chat_id       TEXT NOT NULL,
      status        TEXT,
      error         TEXT,
      sent_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_schedules_active ON schedules(is_active, next_run);
    CREATE INDEX IF NOT EXISTS idx_channels_user ON channels(user_id);
    CREATE INDEX IF NOT EXISTS idx_targets_schedule ON schedule_targets(schedule_id);
  `);

  console.log('✅ Migraciones aplicadas');
}

module.exports = { runMigrations };