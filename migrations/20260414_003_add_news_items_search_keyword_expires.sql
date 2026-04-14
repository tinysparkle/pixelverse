-- 旧库可能缺少 news_items.search_keyword / expires_at，导致 SELECT 报 Unknown column。
-- 与 sql/schema.sql、scripts/migrate-news-columns.ts 对齐。

SET @col_search_keyword = (
	SELECT COUNT(*)
	FROM INFORMATION_SCHEMA.COLUMNS
	WHERE TABLE_SCHEMA = DATABASE()
		AND TABLE_NAME = 'news_items'
		AND COLUMN_NAME = 'search_keyword'
);

SET @alter_search_keyword = IF(
	@col_search_keyword = 0,
	'ALTER TABLE news_items ADD COLUMN search_keyword VARCHAR(100) NULL AFTER tags',
	'SELECT ''skip: news_items.search_keyword already exists'''
);

PREPARE migration_stmt FROM @alter_search_keyword;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @col_expires_at = (
	SELECT COUNT(*)
	FROM INFORMATION_SCHEMA.COLUMNS
	WHERE TABLE_SCHEMA = DATABASE()
		AND TABLE_NAME = 'news_items'
		AND COLUMN_NAME = 'expires_at'
);

SET @alter_expires_at = IF(
	@col_expires_at = 0,
	'ALTER TABLE news_items ADD COLUMN expires_at DATETIME NULL AFTER published_at',
	'SELECT ''skip: news_items.expires_at already exists'''
);

PREPARE migration_stmt FROM @alter_expires_at;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @idx_expires = (
	SELECT COUNT(*)
	FROM INFORMATION_SCHEMA.STATISTICS
	WHERE TABLE_SCHEMA = DATABASE()
		AND TABLE_NAME = 'news_items'
		AND INDEX_NAME = 'idx_news_expires'
);

SET @add_idx_expires = IF(
	@idx_expires = 0,
	'ALTER TABLE news_items ADD INDEX idx_news_expires (expires_at)',
	'SELECT ''skip: idx_news_expires already exists'''
);

PREPARE migration_stmt FROM @add_idx_expires;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @idx_keyword = (
	SELECT COUNT(*)
	FROM INFORMATION_SCHEMA.STATISTICS
	WHERE TABLE_SCHEMA = DATABASE()
		AND TABLE_NAME = 'news_items'
		AND INDEX_NAME = 'idx_news_keyword'
);

SET @add_idx_keyword = IF(
	@idx_keyword = 0,
	'ALTER TABLE news_items ADD INDEX idx_news_keyword (search_keyword)',
	'SELECT ''skip: idx_news_keyword already exists'''
);

PREPARE migration_stmt FROM @add_idx_keyword;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;
