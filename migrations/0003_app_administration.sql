CREATE TABLE IF NOT EXISTS app_records (
 slug TEXT PRIMARY KEY,
 draft_json TEXT NOT NULL,
 published_json TEXT,
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_files (
 id TEXT PRIMARY KEY,
 slug TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('icon','screenshot','apk')),
 object_key TEXT NOT NULL UNIQUE,
 mime TEXT NOT NULL,
 bytes INTEGER NOT NULL,
 version TEXT,
 sha256 TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS app_files_slug ON app_files(slug);
CREATE TABLE IF NOT EXISTS admin_sessions (
 id TEXT PRIMARY KEY,
 csrf TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_login_attempts (
 bucket TEXT PRIMARY KEY,
 window_start INTEGER NOT NULL,
 attempts INTEGER NOT NULL
);
