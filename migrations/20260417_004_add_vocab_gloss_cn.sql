SET @has_gloss_cn := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'vocab_entries'
    AND COLUMN_NAME = 'gloss_cn'
);

SET @ddl := IF(
  @has_gloss_cn = 0,
  'ALTER TABLE vocab_entries ADD COLUMN gloss_cn VARCHAR(120) NULL AFTER normalized_text',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
