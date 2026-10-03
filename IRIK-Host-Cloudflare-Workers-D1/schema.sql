PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin','owner')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  ram_mb INTEGER NOT NULL DEFAULT 1024,
  cpu_percent INTEGER NOT NULL DEFAULT 100,
  disk_mb INTEGER NOT NULL DEFAULT 10240,
  minecraft_version TEXT NOT NULL DEFAULT 'Paper 1.21.8',
  status TEXT NOT NULL DEFAULT 'offline' CHECK(status IN ('offline','online','starting','stopping')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT OR IGNORE INTO users (email,password_salt,password_hash,role) VALUES (
  'rayanjarrar82@gmail.com',
  'Nts3ShZ1RKRfhBpkg43btg==',
  'mVqVJXN8RwX4mVywZMWVKmi6vJ8kxxgwGVXU1X/ZevE=',
  'owner'
);
