CREATE TABLE IF NOT EXISTS document (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'markdown',
  tags_json TEXT NOT NULL DEFAULT '[]',
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL
);
