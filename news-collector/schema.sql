CREATE TABLE IF NOT EXISTS news_items (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  title_zh TEXT,
  summary TEXT,
  summary_zh TEXT,
  content TEXT,
  relevance_score REAL NOT NULL DEFAULT 0,
  tags TEXT,
  published_at TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_news_published ON news_items(published_at);
CREATE INDEX IF NOT EXISTS idx_news_fetched ON news_items(fetched_at);
