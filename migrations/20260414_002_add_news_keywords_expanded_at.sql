SET @column_exists = (
	SELECT COUNT(*)
	FROM INFORMATION_SCHEMA.COLUMNS
	WHERE TABLE_SCHEMA = DATABASE()
		AND TABLE_NAME = 'news_keywords'
		AND COLUMN_NAME = 'expanded_at'
);

SET @alter_sql = IF(
	@column_exists = 0,
	'ALTER TABLE news_keywords ADD COLUMN expanded_at DATETIME NULL AFTER expanded_keywords',
	'SELECT ''skip: news_keywords.expanded_at already exists'''
);

PREPARE migration_stmt FROM @alter_sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;
