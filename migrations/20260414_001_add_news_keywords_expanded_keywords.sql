SET @column_exists = (
	SELECT COUNT(*)
	FROM INFORMATION_SCHEMA.COLUMNS
	WHERE TABLE_SCHEMA = DATABASE()
		AND TABLE_NAME = 'news_keywords'
		AND COLUMN_NAME = 'expanded_keywords'
);

SET @alter_sql = IF(
	@column_exists = 0,
	'ALTER TABLE news_keywords ADD COLUMN expanded_keywords TEXT NULL AFTER keyword',
	'SELECT ''skip: news_keywords.expanded_keywords already exists'''
);

PREPARE migration_stmt FROM @alter_sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;
